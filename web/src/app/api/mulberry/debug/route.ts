// ── Mulberry retrieval debug API ─────────────────────────────────────────────
// Admin-only. Takes a query and returns every stage of the retrieval pipeline:
//   - embedding: 384-d BGE-small preview
//   - question vector search: top-QUESTION_POOL hits from knowledge_chunk_questions
//   - body vector search:     top-CANDIDATE_POOL hits from knowledge_chunks
//   - merged pool:            dedupe of the two by chunk_id (best sim wins)
//   - rerank:                 cross-encoder scores on the merged pool
//   - top_k:                  the final 3 that would be sent to Gemini
//   - context:                the exact formatted SOURCES block the LLM would see
//
// Lets us tell content gaps apart from retrieval failures apart from reranker
// demotions. Never ships an actual LLM call — pure introspection.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  embedText,
  vectorSearch,
  questionVectorSearch,
  mergeCandidates,
  rerank,
  keywordSearch,
  formatContext,
  CANDIDATE_POOL,
  QUESTION_POOL,
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
    matchedVia: c.matchedVia ?? null,
    matchedQuestion: c.matchedQuestion ?? null,
    preview: c.content.length > 240 ? c.content.slice(0, 240) + "…" : c.content,
    content: c.content,
  };
}

export async function POST(request: Request) {
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

  // ── Stage 2a: question vector search ───────────────────────────────────────
  const questionStart = Date.now();
  let questionChunks: RetrievedChunk[] = [];
  let questionHits: Array<{ chunk_id: string; question: string; similarity: number }> = [];
  if (embedding) {
    const { hits, chunks } = await questionVectorSearch(embedding, QUESTION_POOL);
    questionHits = hits;
    questionChunks = chunks;
  }
  timings.question_ms = Date.now() - questionStart;

  // ── Stage 2b: body vector search ───────────────────────────────────────────
  const bodyStart = Date.now();
  let bodyChunks: RetrievedChunk[] = [];
  if (embedding) {
    bodyChunks = await vectorSearch(embedding, CANDIDATE_POOL);
  }
  timings.body_ms = Date.now() - bodyStart;

  // ── Stage 2c: merge ────────────────────────────────────────────────────────
  const merged = mergeCandidates(questionChunks, bodyChunks);

  // ── Stage 2d: keyword fallback (only if both vector paths returned nothing)
  const keywordStart = Date.now();
  let keywordFallback: RetrievedChunk[] = [];
  let usedKeywordFallback = false;
  if (merged.length === 0) {
    keywordFallback = await keywordSearch(query);
    usedKeywordFallback = keywordFallback.length > 0;
  }
  timings.keyword_ms = Date.now() - keywordStart;

  const candidates = usedKeywordFallback ? keywordFallback : merged;

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

  const source = usedKeywordFallback
    ? "keyword_fallback"
    : embedding
      ? merged.length > 0
        ? "vector"
        : "vector_empty"
      : "none";

  return NextResponse.json({
    query,
    source,
    embedding: embeddingPreview,
    timings,
    question_vector: questionChunks.map(toPublicChunk),
    question_hits: questionHits, // raw { chunk_id, question, similarity } for reference
    body_vector: bodyChunks.map(toPublicChunk),
    merged: merged.map(toPublicChunk),
    keyword_fallback: keywordFallback.map(toPublicChunk),
    rerank: reranked.map(toPublicChunk),
    top_k: topK.map(toPublicChunk),
    context_for_llm: contextForLLM,
    config: {
      candidate_pool: CANDIDATE_POOL,
      question_pool: QUESTION_POOL,
      top_k: TOP_K,
    },
  });
}
