// ── Mulberry retrieval pipeline (shared) ─────────────────────────────────────
// Pure retrieval logic — no Next.js route coupling. Used by both the main
// /api/mulberry answer route and the /api/mulberry/debug introspection route,
// so the debug panel always reflects what the real pipeline would do.
//
// Stages:
//   1. embedText(query)        → 384-dim Cloudflare BGE-small vector
//   2. vectorSearch(embedding) → top CANDIDATE_POOL chunks by pgvector cosine
//   3. rerank(query, pool)     → Cloudflare BGE-reranker-base scores on (q, chunk) pairs
//   4. keywordSearch(query)    → IDF fallback when the vector path returns nothing
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

export const CANDIDATE_POOL = 10;
export const TOP_K = 3;

export const CF_EMBED_MODEL  = "@cf/baai/bge-small-en-v1.5";
export const CF_RERANK_MODEL = "@cf/baai/bge-reranker-base";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CF_API_TOKEN;

// Using the anon client for reads — SELECT is public on knowledge_chunks.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface RetrievedChunk {
  chunk_id?: string;
  content: string;
  source?: string | null;
  category?: string | null;
  similarity?: number;    // cosine similarity from pgvector (0–1)
  rerankScore?: number;   // cross-encoder score (higher = better)
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

// ── Vector search ────────────────────────────────────────────────────────────

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
    }));
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
    .map(({ chunk_id, content, source, category }) => ({ chunk_id, content, source, category }));
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
