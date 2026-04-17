// ── Mulberry retrieval debug API ─────────────────────────────────────────────
// Admin-only. Takes a query and returns every stage of the retrieval pipeline:
//   - vector: top-10 pgvector candidates with cosine similarity
//   - rerank: the same 10 candidates scored and re-ordered by the cross-encoder
//   - top_k:  the final 3 that would be sent to Gemini
//   - context: the exact formatted SOURCES block the LLM would see
//
// Use this to tell content gaps apart from retrieval failures apart from reranker
// demotions. Never ships an actual LLM call — pure introspection.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  embedText,
  vectorSearch,
  rerank,
  keywordSearch,
  formatContext,
  CANDIDATE_POOL,
  TOP_K,
  type RetrievedChunk,
} from "@/lib/mulberry/retrieval";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toPublicChunk(c: RetrievedChunk) {
  return {
    chunk_id: c.chunk_id ?? null,
    category: c.category ?? null,
    source: c.source ?? null,
    similarity: c.similarity ?? null,
    rerankScore: c.rerankScore ?? null,
    // Preview only — the full content is fine to return too since SELECT is
    // public on knowledge_chunks, but 240 chars is easier to read in the UI.
    preview: c.content.length > 240 ? c.content.slice(0, 240) + "…" : c.content,
    content: c.content,
  };
}

export async function POST(request: Request) {
  // Admin auth — same pattern as /api/mulberry/reingest.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const query: string = (body?.query ?? "").toString().trim();
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const timings: Record<string, number> = {};
  const t0 = Date.now();

  // ── Stage 1: embed ─────────────────────────────────────────────────────────
  const embedStart = Date.now();
  const embedding = await embedText(query);
  timings.embed_ms = Date.now() - embedStart;
  const embeddingPreview = embedding
    ? {
        dim: embedding.length,
        first_5: embedding.slice(0, 5).map((v) => Number(v.toFixed(4))),
        norm: Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)),
      }
    : null;

  // ── Stage 2: vector search (pgvector top-10) ───────────────────────────────
  const vectorStart = Date.now();
  let vectorCandidates: RetrievedChunk[] = [];
  if (embedding) {
    vectorCandidates = await vectorSearch(embedding, CANDIDATE_POOL);
  }
  timings.vector_ms = Date.now() - vectorStart;

  // ── Stage 2b: keyword fallback (only if vector returned nothing) ───────────
  const keywordStart = Date.now();
  let keywordFallback: RetrievedChunk[] = [];
  let usedKeywordFallback = false;
  if (vectorCandidates.length === 0) {
    keywordFallback = await keywordSearch(query);
    usedKeywordFallback = keywordFallback.length > 0;
  }
  timings.keyword_ms = Date.now() - keywordStart;

  const candidates = usedKeywordFallback ? keywordFallback : vectorCandidates;

  // ── Stage 3: rerank ────────────────────────────────────────────────────────
  const rerankStart = Date.now();
  let reranked: RetrievedChunk[] = candidates;
  if (candidates.length > TOP_K) {
    reranked = await rerank(query, candidates);
  }
  timings.rerank_ms = Date.now() - rerankStart;

  // ── Stage 4: final top-K + formatted context ───────────────────────────────
  const topK = reranked.slice(0, TOP_K);
  const contextForLLM = formatContext(topK);

  timings.total_ms = Date.now() - t0;

  return NextResponse.json({
    query,
    source: usedKeywordFallback ? "keyword_fallback" : (embedding ? "vector" : "none"),
    embedding: embeddingPreview,
    timings,
    vector: vectorCandidates.map(toPublicChunk),
    keyword_fallback: keywordFallback.map(toPublicChunk),
    rerank: reranked.map(toPublicChunk),
    top_k: topK.map(toPublicChunk),
    context_for_llm: contextForLLM,
    config: {
      candidate_pool: CANDIDATE_POOL,
      top_k: TOP_K,
    },
  });
}
