"use client";

import { useState } from "react";

interface DebugChunk {
  chunk_id: string | null;
  category: string | null;
  source: string | null;
  similarity: number | null;
  rerankScore: number | null;
  matchedVia: "question" | "body" | null;
  matchedQuestion: string | null;
  preview: string;
  content: string;
}

interface QuestionHit {
  chunk_id: string;
  question: string;
  similarity: number;
}

interface DebugResult {
  query: string;
  source: "vector" | "vector_empty" | "keyword_fallback" | "none";
  embedding: { dim: number; first_5: number[]; norm: number } | null;
  timings: Record<string, number>;
  question_vector: DebugChunk[];
  question_hits: QuestionHit[];
  body_vector: DebugChunk[];
  merged: DebugChunk[];
  keyword_fallback: DebugChunk[];
  rerank: DebugChunk[];
  top_k: DebugChunk[];
  context_for_llm: string;
  config: { candidate_pool: number; question_pool: number; top_k: number };
}

const EXAMPLE_QUERIES = [
  "how does the commission vote?",
  "what is a runoff?",
  "how do I contact my commissioner?",
  "who is the mayor",
  "when is the next election",
];

function fmt(n: number | null, digits = 4): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function ChunkRow({
  chunk,
  rank,
  highlight,
  showMatched,
}: {
  chunk: DebugChunk;
  rank: number;
  highlight: boolean;
  showMatched?: boolean;
}) {
  return (
    <tr style={{ background: highlight ? "var(--peach-bg)" : "transparent" }}>
      <td style={{ padding: "6px 8px", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)", fontSize: "0.8rem", width: 28 }}>{rank}</td>
      <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
        {chunk.chunk_id ?? "—"}
      </td>
      <td style={{ padding: "6px 8px", fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
        {chunk.category ?? "—"}
      </td>
      <td style={{ padding: "6px 8px", fontVariantNumeric: "tabular-nums", fontSize: "0.8rem", textAlign: "right", whiteSpace: "nowrap" }}>
        {fmt(chunk.similarity, 4)}
      </td>
      <td style={{ padding: "6px 8px", fontVariantNumeric: "tabular-nums", fontSize: "0.8rem", textAlign: "right", whiteSpace: "nowrap" }}>
        {fmt(chunk.rerankScore, 4)}
      </td>
      {showMatched && (
        <td style={{ padding: "6px 8px", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
          {chunk.matchedVia ?? "—"}
        </td>
      )}
      <td style={{ padding: "6px 8px", fontSize: "0.85rem", lineHeight: 1.4 }}>
        {chunk.matchedQuestion ? (
          <div>
            <div style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.78rem", marginBottom: 2 }}>
              matched: “{chunk.matchedQuestion}”
            </div>
            <div>{chunk.preview}</div>
          </div>
        ) : (
          chunk.preview
        )}
      </td>
    </tr>
  );
}

function ChunkTable({
  title,
  chunks,
  highlight,
  sortedBy,
  showMatched,
}: {
  title: string;
  chunks: DebugChunk[];
  highlight?: (c: DebugChunk) => boolean;
  sortedBy: "similarity" | "rerank" | "none";
  showMatched?: boolean;
}) {
  if (chunks.length === 0) {
    return (
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-title" style={{ marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>No results.</div>
      </div>
    );
  }
  return (
    <div className="admin-card" style={{ marginBottom: 16 }}>
      <div className="admin-card-title" style={{ marginBottom: 8 }}>
        {title} <span style={{ color: "var(--text-secondary)", fontWeight: 400, fontSize: "0.85rem" }}>· {chunks.length} {chunks.length === 1 ? "chunk" : "chunks"} · sorted by {sortedBy}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid var(--border)", textAlign: "left" }}>
              <th style={{ padding: "6px 8px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", width: 28 }}>#</th>
              <th style={{ padding: "6px 8px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>chunk_id</th>
              <th style={{ padding: "6px 8px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>cat</th>
              <th style={{ padding: "6px 8px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", textAlign: "right" }}>cosine</th>
              <th style={{ padding: "6px 8px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", textAlign: "right" }}>rerank</th>
              {showMatched && (
                <th style={{ padding: "6px 8px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>via</th>
              )}
              <th style={{ padding: "6px 8px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>preview</th>
            </tr>
          </thead>
          <tbody>
            {chunks.map((c, i) => (
              <ChunkRow
                key={`${c.chunk_id ?? i}-${i}`}
                chunk={c}
                rank={i + 1}
                highlight={!!highlight?.(c)}
                showMatched={showMatched}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DebugPanel() {
  const [query, setQuery] = useState("");
  const [watch, setWatch] = useState(""); // optional chunk_id to highlight across stages
  const [result, setResult] = useState<DebugResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q?: string) {
    const theQuery = (q ?? query).trim();
    if (!theQuery) return;
    setQuery(theQuery);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/mulberry/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: theQuery }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as DebugResult;
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const highlightFn = watch.trim()
    ? (c: DebugChunk) => (c.chunk_id ?? "").toLowerCase() === watch.trim().toLowerCase()
    : undefined;

  const watchIn = (arr: DebugChunk[]) =>
    highlightFn ? arr.findIndex((c) => highlightFn(c)) : -1;

  const watchInQuestions = result ? watchIn(result.question_vector) : -1;
  const watchInBody = result ? watchIn(result.body_vector) : -1;
  const watchInMerged = result ? watchIn(result.merged) : -1;
  const watchInRerank = result ? watchIn(result.rerank) : -1;
  const watchInTopK = result ? watchIn(result.top_k) : -1;

  const retrievalPathLabel =
    result?.source === "vector"
      ? "vector (dual: questions + body)"
      : result?.source === "vector_empty"
        ? "vector (empty — no hits)"
        : result?.source === "keyword_fallback"
          ? "keyword fallback (no vector hits)"
          : "none";

  return (
    <div>
      {/* Query input */}
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-title" style={{ marginBottom: 8 }}>Query</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="how does the commission vote?"
            style={{
              flex: 1,
              padding: "10px 12px",
              border: "1.5px solid var(--border)",
              fontSize: "0.95rem",
              fontFamily: "inherit",
              background: "var(--card)",
            }}
          />
          <button
            onClick={() => run()}
            disabled={loading || !query.trim()}
            style={{
              background: query.trim() && !loading ? "var(--peach)" : "var(--border)",
              border: "none",
              color: "white",
              padding: "10px 18px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontSize: "0.75rem",
              cursor: query.trim() && !loading ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Running…" : "Trace"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Examples:</span>
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => run(q)}
              disabled={loading}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                padding: "4px 10px",
                fontSize: "0.8rem",
                cursor: loading ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {q}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
            Highlight chunk_id:
          </label>
          <input
            value={watch}
            onChange={(e) => setWatch(e.target.value)}
            placeholder="kb-charter-voting-threshold"
            style={{
              flex: 1,
              padding: "6px 10px",
              border: "1.5px solid var(--border)",
              fontSize: "0.85rem",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              background: "var(--card)",
            }}
          />
        </div>
      </div>

      {error && (
        <div className="admin-card" style={{ marginBottom: 16, background: "#fee", border: "1.5px solid #fcc" }}>
          <div style={{ color: "#b91c1c", fontSize: "0.9rem" }}>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {result && (
        <>
          {/* Summary strip */}
          <div className="admin-card" style={{ marginBottom: 16 }}>
            <div className="admin-card-title" style={{ marginBottom: 8 }}>Summary</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, fontSize: "0.85rem" }}>
              <div>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Retrieval path</div>
                <div style={{ fontWeight: 600 }}>{retrievalPathLabel}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Embedding</div>
                <div style={{ fontWeight: 600 }}>{result.embedding ? `${result.embedding.dim}-d, ‖v‖=${result.embedding.norm.toFixed(3)}` : "failed"}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Timings</div>
                <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  embed {result.timings.embed_ms}ms · questions {result.timings.question_ms}ms · body {result.timings.body_ms}ms · rerank {result.timings.rerank_ms}ms · total {result.timings.total_ms}ms
                </div>
              </div>
              {highlightFn && (
                <div>
                  <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Watched chunk</div>
                  <div style={{ fontWeight: 600 }}>
                    questions: {watchInQuestions >= 0 ? `#${watchInQuestions + 1}` : "not in pool"} ·
                    body: {watchInBody >= 0 ? `#${watchInBody + 1}` : "not in pool"} ·
                    merged: {watchInMerged >= 0 ? `#${watchInMerged + 1}` : "not in pool"} ·
                    rerank: {watchInRerank >= 0 ? `#${watchInRerank + 1}` : "not ranked"} ·
                    top-{result.config.top_k}: {watchInTopK >= 0 ? `#${watchInTopK + 1}` : "not sent to Gemini"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Keyword fallback (only shown if it was used) */}
          {result.source === "keyword_fallback" && (
            <ChunkTable
              title="Keyword fallback candidates"
              chunks={result.keyword_fallback}
              highlight={highlightFn}
              sortedBy="similarity"
            />
          )}

          {/* Stage 2a: question vector search */}
          <ChunkTable
            title={`Question vector top-${result.config.question_pool}  (knowledge_chunk_questions)`}
            chunks={result.question_vector}
            highlight={highlightFn}
            sortedBy="similarity"
          />

          {/* Stage 2b: body vector search */}
          <ChunkTable
            title={`Body vector top-${result.config.candidate_pool}  (knowledge_chunks)`}
            chunks={result.body_vector}
            highlight={highlightFn}
            sortedBy="similarity"
          />

          {/* Stage 2c: merged */}
          <ChunkTable
            title="Merged pool (dedupe by chunk_id, best sim wins)"
            chunks={result.merged}
            highlight={highlightFn}
            sortedBy="similarity"
            showMatched
          />

          {/* Stage 3: rerank */}
          <ChunkTable
            title="After cross-encoder rerank"
            chunks={result.rerank}
            highlight={highlightFn}
            sortedBy="rerank"
            showMatched
          />

          {/* Stage 4: final top-K */}
          <ChunkTable
            title={`Top-${result.config.top_k} sent to Gemini`}
            chunks={result.top_k}
            highlight={highlightFn}
            sortedBy="rerank"
            showMatched
          />

          {/* Context preview */}
          <div className="admin-card" style={{ marginBottom: 16 }}>
            <div className="admin-card-title" style={{ marginBottom: 8 }}>Context block sent to Gemini</div>
            <pre style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "0.82rem",
              lineHeight: 1.5,
              padding: 12,
              background: "var(--card)",
              border: "1px solid var(--border)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              maxHeight: 400,
              overflowY: "auto",
            }}>
              {result.context_for_llm}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
