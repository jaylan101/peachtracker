// ── Mulberry reingest API ────────────────────────────────────────────────────
// Admin-only route that rebuilds the knowledge_chunks table from the canonical
// web/data/knowledge-chunks.jsonl file.
//
// Phased to stay inside Vercel's serverless limits:
//   POST ?phase=reset            — deletes all rows (fast)
//   POST ?phase=embed&start=N    — embeds + inserts chunks [N, N+BATCH)
//                                  returns { done, next, total }
//   POST (no phase)              — runs reset, then embed from 0 with auto-continue
//                                  (client should loop on `next` until done)
//
// Auth: requires logged-in admin (is_admin() RPC). No service key needed —
// uses the user's Supabase cookie session. Your RLS already permits admin
// inserts into knowledge_chunks.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const maxDuration = 60; // seconds — plenty for 20-chunk batches

const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN   = process.env.CF_API_TOKEN;
const CF_EMBED_MODEL = "@cf/baai/bge-small-en-v1.5"; // 384 dims

const BATCH = 20; // chunks per phase=embed call

interface RawChunk {
  id: string;
  category: string;
  content: string;
  hypothetical_questions: string[];
  source?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadChunks(): Promise<RawChunk[]> {
  // web/data/knowledge-chunks.jsonl is shipped with the build.
  // process.cwd() in Vercel is the project root (web/).
  const jsonlPath = path.join(process.cwd(), "data", "knowledge-chunks.jsonl");
  const raw = await readFile(jsonlPath, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RawChunk);
}

function buildEmbeddingText(c: RawChunk): string {
  const qs = Array.isArray(c.hypothetical_questions) ? c.hypothetical_questions : [];
  if (qs.length === 0) return c.content;
  return `${c.content}\n\nRelated questions:\n${qs.map((q) => `- ${q}`).join("\n")}`;
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
  if (phase === "reset") {
    const { error, count } = await supabase
      .from("knowledge_chunks")
      .delete({ count: "exact" })
      .not("chunk_id", "is", null);

    if (error) {
      return NextResponse.json({ error: `Delete failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ phase: "reset", deleted: count ?? 0 });
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
    const results: { id: string; ok: boolean; err?: string }[] = [];

    for (const c of slice) {
      try {
        const vec = await embed(buildEmbeddingText(c));
        const { error: insErr } = await supabase
          .from("knowledge_chunks")
          .insert({
            chunk_id: c.id,
            category: c.category,
            content: c.content,
            hypothetical_questions: c.hypothetical_questions ?? [],
            source: c.source ?? null,
            embedding: vec,
          });
        if (insErr) {
          results.push({ id: c.id, ok: false, err: insErr.message });
        } else {
          results.push({ id: c.id, ok: true });
        }
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
      batch: results,
    });
  }

  // ── default: run reset + one embed batch, then the caller loops ────────────
  const { error: delErr, count: delCount } = await supabase
    .from("knowledge_chunks")
    .delete({ count: "exact" })
    .not("chunk_id", "is", null);
  if (delErr) {
    return NextResponse.json({ error: `Reset failed: ${delErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    phase: "reset+hint",
    deleted: delCount ?? 0,
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

  const [{ count: dbCount }, chunks] = await Promise.all([
    supabase.from("knowledge_chunks").select("*", { count: "exact", head: true }),
    loadChunks().catch(() => [] as RawChunk[]),
  ]);

  return NextResponse.json({
    db_row_count: dbCount ?? 0,
    source_chunk_count: chunks.length,
    in_sync: (dbCount ?? 0) === chunks.length,
  });
}
