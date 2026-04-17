// ── Mulberry reingest API (Option 2: per-question embeddings) ───────────────
// Rebuilds BOTH knowledge-base tables from web/data/knowledge-chunks.jsonl:
//
//   - `knowledge_chunks`            — one row per chunk, embedding is the body.
//   - `knowledge_chunk_questions`   — one row per hypothetical question, each
//                                     with its own embedding vector.
//
// Why two tables: BGE-small bi-encoder is weak at matching short queries
// ("how does the commission vote?") against long mixed-content embeddings.
// Storing each question as its own row gives us near-identical cosine match
// when a user query echoes one of the hypotheticals. The body table remains
// for queries that don't happen to match a stored question phrasing.
//
// Phased to stay inside Vercel serverless limits:
//   POST ?phase=reset            — deletes BOTH tables (FK cascades questions)
//   POST ?phase=embed&start=N    — for chunks [N, N+BATCH):
//                                    (a) embed body → insert knowledge_chunks
//                                    (b) embed each question → insert
//                                        knowledge_chunk_questions rows
//                                  returns { done, next, total, counts }
//   POST (no phase)              — runs reset, then client loops phase=embed
//
// Auth: logged-in admin via is_admin() RPC. RLS on both tables grants
// INSERT/UPDATE/DELETE to authenticated admins (see
// project_peachtracker_supabase_rls.md).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const maxDuration = 60; // seconds

const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN   = process.env.CF_API_TOKEN;
const CF_EMBED_MODEL = "@cf/baai/bge-small-en-v1.5"; // 384 dims

// ~6× the embedding calls per chunk now (1 body + 5 questions avg), so the
// batch is smaller to stay under the 60s serverless limit.
const BATCH = 10;

interface RawChunk {
  id: string;
  category: string;
  content: string;
  hypothetical_questions: string[];
  source?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadChunks(): Promise<RawChunk[]> {
  const jsonlPath = path.join(process.cwd(), "data", "knowledge-chunks.jsonl");
  const raw = await readFile(jsonlPath, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RawChunk);
}

async function embed(text: string): Promise<number[]> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error("CF_ACCOUNT_ID / CF_API_TOKEN not configured on Vercel");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_EMBED_MODEL}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`CF embedding error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const vec = data?.result?.data?.[0];
  if (!vec || vec.length !== 384) {
    throw new Error(`Unexpected embedding shape from CF`);
  }
  return vec;
}

// The body-vector search is the fallback retrieval path. Embed the chunk body
// plain — no question injection. Per-question matching is the job of the
// knowledge_chunk_questions table now.
function buildBodyEmbeddingText(c: RawChunk): string {
  return c.content;
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const phase = searchParams.get("phase");

  // ── phase=reset ────────────────────────────────────────────────────────────
  // Wipe questions FIRST (child via FK cascade would also do it, but being
  // explicit keeps the numbers visible to the admin UI).
  if (phase === "reset") {
    const { error: qErr, count: qCount } = await supabase
      .from("knowledge_chunk_questions")
      .delete({ count: "exact" })
      .gte("id", 0);
    if (qErr) {
      return NextResponse.json({ error: `Delete questions failed: ${qErr.message}` }, { status: 500 });
    }

    const { error: cErr, count: cCount } = await supabase
      .from("knowledge_chunks")
      .delete({ count: "exact" })
      .not("chunk_id", "is", null);
    if (cErr) {
      return NextResponse.json({ error: `Delete chunks failed: ${cErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      phase: "reset",
      deleted_chunks: cCount ?? 0,
      deleted_questions: qCount ?? 0,
    });
  }

  // ── phase=embed ────────────────────────────────────────────────────────────
  if (phase === "embed") {
    const start = parseInt(searchParams.get("start") ?? "0", 10);
    const chunks = await loadChunks();
    const total = chunks.length;

    if (start >= total) {
      return NextResponse.json({ phase: "embed", done: true, total, inserted: 0 });
    }

    const slice = chunks.slice(start, start + BATCH);
    const results: {
      id: string;
      ok: boolean;
      err?: string;
      questions_inserted?: number;
    }[] = [];
    let totalQuestionsInserted = 0;

    for (const c of slice) {
      try {
        // 1) Body embedding → knowledge_chunks
        const bodyVec = await embed(buildBodyEmbeddingText(c));
        const { error: insErr } = await supabase
          .from("knowledge_chunks")
          .insert({
            chunk_id: c.id,
            category: c.category,
            content: c.content,
            hypothetical_questions: c.hypothetical_questions ?? [],
            source: c.source ?? null,
            embedding: bodyVec,
          });
        if (insErr) {
          results.push({ id: c.id, ok: false, err: `body insert: ${insErr.message}` });
          continue;
        }

        // 2) Per-question embeddings → knowledge_chunk_questions
        const qs = Array.isArray(c.hypothetical_questions) ? c.hypothetical_questions : [];
        const qRows: { chunk_id: string; question: string; embedding: number[] }[] = [];
        for (const q of qs) {
          const question = q?.trim();
          if (!question) continue;
          const qVec = await embed(question);
          qRows.push({ chunk_id: c.id, question, embedding: qVec });
        }

        if (qRows.length > 0) {
          const { error: qInsErr } = await supabase
            .from("knowledge_chunk_questions")
            .insert(qRows);
          if (qInsErr) {
            results.push({
              id: c.id,
              ok: false,
              err: `questions insert: ${qInsErr.message}`,
              questions_inserted: 0,
            });
            continue;
          }
        }

        totalQuestionsInserted += qRows.length;
        results.push({ id: c.id, ok: true, questions_inserted: qRows.length });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ id: c.id, ok: false, err: msg });
      }
    }

    const next = start + slice.length;
    const done = next >= total;
    return NextResponse.json({
      phase: "embed",
      done,
      total,
      processed: next,
      next: done ? null : next,
      questions_inserted_this_batch: totalQuestionsInserted,
      batch: results,
    });
  }

  // ── default: reset + hint ──────────────────────────────────────────────────
  const { error: qErr, count: qCount } = await supabase
    .from("knowledge_chunk_questions")
    .delete({ count: "exact" })
    .gte("id", 0);
  if (qErr) {
    return NextResponse.json({ error: `Reset questions failed: ${qErr.message}` }, { status: 500 });
  }

  const { error: delErr, count: delCount } = await supabase
    .from("knowledge_chunks")
    .delete({ count: "exact" })
    .not("chunk_id", "is", null);
  if (delErr) {
    return NextResponse.json({ error: `Reset chunks failed: ${delErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    phase: "reset+hint",
    deleted_chunks: delCount ?? 0,
    deleted_questions: qCount ?? 0,
    hint: "Now call POST ?phase=embed&start=0 repeatedly (using the `next` cursor) until `done: true`.",
  });
}

// GET: quick status check
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [chunksCount, questionsCount, chunks] = await Promise.all([
    supabase.from("knowledge_chunks").select("*", { count: "exact", head: true }),
    supabase.from("knowledge_chunk_questions").select("*", { count: "exact", head: true }),
    loadChunks().catch(() => [] as RawChunk[]),
  ]);

  const expectedQuestions = chunks.reduce(
    (n, c) => n + (c.hypothetical_questions?.length ?? 0),
    0
  );

  return NextResponse.json({
    db_row_count: chunksCount.count ?? 0,
    db_question_count: questionsCount.count ?? 0,
    source_chunk_count: chunks.length,
    source_question_count: expectedQuestions,
    in_sync:
      (chunksCount.count ?? 0) === chunks.length &&
      (questionsCount.count ?? 0) === expectedQuestions,
  });
}
