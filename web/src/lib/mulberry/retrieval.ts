// ── Mulberry retrieval pipeline (shared) ─────────────────────────────────────
// Pure retrieval logic — no Next.js route coupling. Used by both the main
// /api/mulberry answer route and the /api/mulberry/debug introspection route.
//
// Option 2 (per-question embeddings) — dual vector search + merge:
//   1. embedText(query)
//       → 384-dim Cloudflare BGE-small vector
//   2a. questionVectorSearch(emb)
//       → top-QUESTION_POOL rows from knowledge_chunk_questions (one row per
//         hypothetical question). The RPC returns the best-similarity question
//         per chunk_id, so we already get a list of distinct chunks.
//   2b. vectorSearch(emb)
//       → top-CANDIDATE_POOL rows from knowledge_chunks (body embedding, the
//         fallback path for free-form queries that don't match any question).
//   3.  mergeCandidates(questionHits, bodyHits)
//       → dedupe by chunk_id, preserve the BEST similarity seen across both
//         sources, remember which source each hit came from.
//   4.  rerank(query, merged)
//       → Cloudflare BGE-reranker-base cross-encoder scores.
//   5.  keywordSearch(query)
//       → IDF fallback if both vector paths return empty.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

export const CANDIDATE_POOL  = 10; // body-vector top-N
export const QUESTION_POOL   = 20; // question-vector top-N (before dedupe)
export const TOP_K           = 3;  // final chunks sent to Gemini

export const CF_EMBED_MODEL  = "@cf/baai/bge-small-en-v1.5";
export const CF_RERANK_MODEL = "@cf/baai/bge-reranker-base";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CF_API_TOKEN;

// Anon client — SELECT is public on both knowledge_chunks and
// knowledge_chunk_questions.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type RetrievalSource = "question" | "body";

export interface RetrievedChunk {
  chunk_id?: string;
  content: string;
  source?: string | null;
  category?: string | null;
  similarity?: number;          // best cosine similarity seen for this chunk
  rerankScore?: number;         // cross-encoder score
  matchedVia?: RetrievalSource; // which vector search best-matched this chunk
  matchedQuestion?: string;     // when matchedVia === "question", the question text
}

// Lightweight rows returned from the question RPC (chunk body comes from a
// follow-up fetch on knowledge_chunks).
export interface QuestionHit {
  chunk_id: string;
  question: string;
  similarity: number;
}

// ── Embedding ────────────────────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[] | null> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_EMBED_MODEL}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vector: number[] = data?.result?.data?.[0];
    return vector?.length === 384 ? vector : null;
  } catch {
    return null;
  }
}

// ── Body vector search (knowledge_chunks) ────────────────────────────────────

export async function vectorSearch(
  queryEmbedding: number[],
  limit: number = CANDIDATE_POOL,
  matchThreshold: number = 0.15
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: limit,
  });
  if (error || !data) return [];
  return (data as Array<{ chunk_id?: string; content: string; source?: string | null; category?: string | null; similarity: number }>)
    .map((r) => ({
      chunk_id: r.chunk_id,
      content: r.content,
      source: r.source ?? null,
      category: r.category ?? null,
      similarity: r.similarity,
      matchedVia: "body" as RetrievalSource,
    }));
}

// ── Question vector search (knowledge_chunk_questions) ───────────────────────
// The RPC returns (chunk_id, question, similarity) — one row per distinct
// chunk_id, picking the question that best matched the query. We then fetch
// the full chunk rows so the caller has `content`, `source`, `category`.

export async function questionVectorSearch(
  queryEmbedding: number[],
  limit: number = QUESTION_POOL,
  matchThreshold: number = 0.15
): Promise<{ hits: QuestionHit[]; chunks: RetrievedChunk[] }> {
  const { data, error } = await supabase.rpc("match_knowledge_chunk_questions", {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: limit,
  });
  if (error || !data) return { hits: [], chunks: [] };

  const hits = (data as QuestionHit[]) ?? [];
  if (hits.length === 0) return { hits: [], chunks: [] };

  const chunkIds = hits.map((h) => h.chunk_id);
  const { data: rows } = await supabase
    .from("knowledge_chunks")
    .select("chunk_id, content, source, category")
    .in("chunk_id", chunkIds);

  const byId = new Map<string, { content: string; source: string | null; category: string | null }>();
  for (const r of rows ?? []) {
    byId.set(r.chunk_id as string, {
      content: r.content as string,
      source: (r.source as string | null) ?? null,
      category: (r.category as string | null) ?? null,
    });
  }

  const chunks: RetrievedChunk[] = [];
  for (const h of hits) {
    const row = byId.get(h.chunk_id);
    if (!row) continue;
    chunks.push({
      chunk_id: h.chunk_id,
      content: row.content,
      source: row.source,
      category: row.category,
      similarity: h.similarity,
      matchedVia: "question",
      matchedQuestion: h.question,
    });
  }

  return { hits, chunks };
}

// ── Merge + dedupe ───────────────────────────────────────────────────────────
// Preserves the best similarity seen for each chunk_id, and notes which source
// (question vs. body) produced that winning similarity. Question hits usually
// win because the query vector is near-identical to the stored question vector;
// body hits backfill chunks that no question happened to match.

export function mergeCandidates(
  questionChunks: RetrievedChunk[],
  bodyChunks: RetrievedChunk[]
): RetrievedChunk[] {
  const byId = new Map<string, RetrievedChunk>();

  const consider = (c: RetrievedChunk) => {
    const key = c.chunk_id ?? c.content.slice(0, 60);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, { ...c });
      return;
    }
    const oldSim = existing.similarity ?? -1;
    const newSim = c.similarity ?? -1;
    if (newSim > oldSim) {
      byId.set(key, { ...c });
    }
  };

  // Question hits first so that when scores tie, the question path wins and we
  // preserve `matchedQuestion` in the debug output.
  for (const c of questionChunks) consider(c);
  for (const c of bodyChunks) consider(c);

  return Array.from(byId.values()).sort(
    (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)
  );
}

// ── Reranker ─────────────────────────────────────────────────────────────────

export async function rerank(
  query: string,
  candidates: RetrievedChunk[]
): Promise<RetrievedChunk[]> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || candidates.length === 0) return candidates;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_RERANK_MODEL}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        contexts: candidates.map((c) => ({ text: c.content })),
        top_k: candidates.length,
      }),
    });
    if (!res.ok) return candidates; // fail open
    const data = await res.json();
    const scores = data?.result?.response as Array<{ id: number; score: number }> | undefined;
    if (!scores?.length) return candidates;

    const withScores = scores.map((s) => ({
      ...candidates[s.id],
      rerankScore: s.score,
    }));
    withScores.sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
    return withScores;
  } catch {
    return candidates;
  }
}

// ── Keyword search (fallback) ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","and","for","are","was","were","has","have","had","this","that","with",
  "from","they","them","their","what","when","where","who","how","can","will",
  "about","which","there","been","more","also","into","than","then","some",
  "would","could","should","does","did","not","but","you","your","its","our",
  "tell","me","is","in","of","to","a","an","do","on","at","by","be","it",
]);

export async function keywordSearch(query: string): Promise<RetrievedChunk[]> {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  if (words.length === 0) return [];

  const ilikeConditions = words.map((w) => `content.ilike.%${w}%`).join(",");
  const { data: rows } = await supabase
    .from("knowledge_chunks")
    .select("chunk_id, content, source, category")
    .or(ilikeConditions)
    .limit(20);

  if (!rows?.length) return [];

  const totalDocs = rows.length;
  const wordDocFreq: Record<string, number> = {};
  for (const word of words) {
    wordDocFreq[word] = rows.filter((r) => r.content.toLowerCase().includes(word)).length;
  }

  return rows
    .map((row) => {
      const lower = row.content.toLowerCase();
      let score = 0;
      let matchCount = 0;
      for (const word of words) {
        if (lower.includes(word)) {
          score += Math.log(totalDocs / (wordDocFreq[word] ?? 1) + 1);
          matchCount++;
        }
      }
      return {
        chunk_id: row.chunk_id,
        content: row.content,
        source: row.source ?? null,
        category: row.category ?? null,
        score,
        matchCount,
      };
    })
    .filter((r) => r.matchCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_POOL)
    .map(({ chunk_id, content, source, category }) => ({
      chunk_id,
      content,
      source,
      category,
    }));
}

// ── Context formatter (shared with route.ts) ─────────────────────────────────

export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "No relevant information found in the knowledge base.";
  return chunks
    .map((c, i) => {
      const src = c.source ? ` (source: ${c.source})` : "";
      return `[Source ${i + 1}${src}]\n${c.content}`;
    })
    .join("\n\n");
}
