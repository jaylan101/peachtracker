"use client";

import { useState } from "react";

// Rebuild the Mulberry knowledge base from web/data/knowledge-chunks.jsonl.
// Runs in phases so we never exceed the Vercel function timeout:
//   1. POST ?phase=reset         — deletes all existing rows
//   2. POST ?phase=embed&start=N — embeds + inserts up to BATCH chunks
//                                  loops until { done: true }

export function ReingestButton({ initialDbCount, initialSourceCount }: {
  initialDbCount: number;
  initialSourceCount: number;
}) {
  const [status, setStatus] = useState<"idle" | "reset" | "embed" | "done" | "error">("idle");
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: initialSourceCount });
  const [dbCount, setDbCount] = useState(initialDbCount);

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  async function reingest() {
    if (!confirm(
      "This will DELETE all " + dbCount + " existing Mulberry chunks and rebuild " +
      "the knowledge base from scratch (" + initialSourceCount + " chunks). Continue?"
    )) return;

    setStatus("reset");
    setLog([]);
    setProgress({ done: 0, total: initialSourceCount });

    try {
      addLog("Clearing existing knowledge_chunks…");
      const r1 = await fetch("/api/mulberry/reingest?phase=reset", { method: "POST" });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error ?? "Reset failed");
      addLog(`✓ Deleted ${d1.deleted} rows`);

      setStatus("embed");
      let start = 0;
      let totalFailed = 0;

      while (true) {
        const r2 = await fetch(`/api/mulberry/reingest?phase=embed&start=${start}`, { method: "POST" });
        const d2 = await r2.json();
        if (!r2.ok) throw new Error(d2.error ?? "Embed batch failed");

        const failed = (d2.batch ?? []).filter((b: { ok: boolean }) => !b.ok);
        totalFailed += failed.length;

        setProgress({ done: d2.processed, total: d2.total });
        setDbCount(d2.processed - totalFailed);

        if (d2.done) {
          if (totalFailed > 0) {
            addLog(`✗ ${totalFailed} chunks failed to embed — check logs`);
            // Log the first few failures
            (d2.batch ?? []).filter((b: { ok: boolean }) => !b.ok).slice(0, 3).forEach((b: { id: string; err?: string }) =>
              addLog(`  ${b.id}: ${b.err}`)
            );
          }
          addLog(`✓ Rebuilt knowledge base: ${d2.processed - totalFailed}/${d2.total} chunks embedded`);
          setStatus(totalFailed > 0 ? "error" : "done");
          return;
        }

        start = d2.next;
      }
    } catch (e) {
      addLog(`✗ ${e instanceof Error ? e.message : String(e)}`);
      setStatus("error");
    }
  }

  const isRunning = status === "reset" || status === "embed";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={reingest} disabled={isRunning} className="admin-btn">
          {isRunning ? (status === "reset" ? "Clearing…" : "Embedding…") : "↻ Rebuild knowledge base"}
        </button>
        {status === "embed" && progress.total > 0 && (
          <span style={{ fontSize: "var(--body)", color: "var(--text-secondary)", fontWeight: 600 }}>
            Chunk {progress.done}/{progress.total}
          </span>
        )}
        <span style={{ fontSize: "var(--body)", color: "var(--text-secondary)" }}>
          Current rows: <strong>{dbCount}</strong> · Source chunks: <strong>{initialSourceCount}</strong>
        </span>
      </div>

      {log.length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 14px",
            background: status === "error" ? "#fef2f2" : "var(--green-bg)",
            border: `1.5px solid ${status === "error" ? "#fecaca" : "var(--green-pastel)"}`,
            fontSize: "var(--body)",
            fontWeight: 600,
            color: status === "error" ? "#991b1b" : "#14532d",
            display: "flex",
            flexDirection: "column" as const,
            gap: 4,
          }}
        >
          {log.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
