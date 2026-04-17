import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { readFile } from "fs/promises";
import path from "path";
import { ReingestButton } from "./_components/reingest-button";

// Mulberry admin — rebuild the RAG knowledge base when chunks change.
// Source of truth: web/data/knowledge-chunks.jsonl (committed to repo).
export default async function MulberryAdminPage() {
  const supabase = await createClient();

  const { count: dbCount } = await supabase
    .from("knowledge_chunks")
    .select("*", { count: "exact", head: true });

  let sourceCount = 0;
  let categoryBreakdown: Record<string, number> = {};
  try {
    const jsonlPath = path.join(process.cwd(), "data", "knowledge-chunks.jsonl");
    const raw = await readFile(jsonlPath, "utf8");
    const chunks = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { category: string });
    sourceCount = chunks.length;
    categoryBreakdown = chunks.reduce((acc: Record<string, number>, c) => {
      acc[c.category] = (acc[c.category] ?? 0) + 1;
      return acc;
    }, {});
  } catch {
    // file missing — will be flagged in the UI
  }

  const inSync = (dbCount ?? 0) === sourceCount && sourceCount > 0;

  return (
    <main className="admin-shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h1 className="admin-h1">Mulberry AI</h1>
        <Link href="/admin" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          ← Dashboard
        </Link>
      </div>
      <p className="admin-sub">
        RAG knowledge base that powers the &ldquo;Ask Mulberry&rdquo; chat on PeachTracker.
        Rebuild when <code>web/data/knowledge-chunks.jsonl</code> changes.
      </p>

      <div className="admin-card" style={{ marginBottom: 20 }}>
        <div className="admin-card-title" style={{ marginBottom: 8 }}>
          Status
        </div>
        <div style={{ fontSize: "var(--body)", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>
            <strong>{dbCount ?? 0}</strong> chunks in Supabase
          </span>
          <span>
            <strong>{sourceCount}</strong> chunks in source file
          </span>
          <span style={{ color: inSync ? "var(--green)" : "#b45309", fontWeight: 600 }}>
            {inSync ? "✓ In sync" : "⚠ Out of sync — rebuild to update"}
          </span>
        </div>
        {Object.keys(categoryBreakdown).length > 0 && (
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 8 }}>
            Source breakdown:{" "}
            {Object.entries(categoryBreakdown)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([c, n]) => `${c}: ${n}`)
              .join(" · ")}
          </div>
        )}
      </div>

      <div className="admin-card" style={{ marginBottom: 20 }}>
        <div className="admin-card-title" style={{ marginBottom: 8 }}>
          Rebuild knowledge base
        </div>
        <p style={{ fontSize: "var(--body)", color: "var(--text-secondary)", marginBottom: 12 }}>
          Deletes all existing chunks and re-embeds every chunk in the source file
          using Cloudflare BGE-small. Safe to run anytime — the chat will briefly
          have no context while embeddings are rebuilding (~1-2 minutes).
          Each chunk&rsquo;s <code>hypothetical_questions</code> are mixed into the
          embedding input so user queries match questions as well as answers.
        </p>
        <ReingestButton
          initialDbCount={dbCount ?? 0}
          initialSourceCount={sourceCount}
        />
      </div>

      <div className="admin-card">
        <div className="admin-card-title" style={{ marginBottom: 8 }}>
          Pipeline
        </div>
        <div style={{ fontSize: "var(--body)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          User query → Cloudflare BGE-small embedding (384 dims) →
          pgvector top-10 candidates → Cloudflare BGE-reranker-base re-rank →
          top-3 to Gemma 4 26B → natural language answer.
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
