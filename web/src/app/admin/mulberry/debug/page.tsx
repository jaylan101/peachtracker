import Link from "next/link";
import { DebugPanel } from "./_components/debug-panel";

export default function MulberryDebugPage() {
  return (
    <main className="admin-shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h1 className="admin-h1">Mulberry retrieval debug</h1>
        <Link href="/admin/mulberry" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          ← Mulberry AI
        </Link>
      </div>
      <p className="admin-sub">
        Trace a query through the full retrieval pipeline. Shows the top-{10} pgvector candidates,
        the cross-encoder rerank scores, and the exact context that would be sent to Gemini.
        Use this to tell content gaps apart from retrieval misses apart from reranker demotions.
      </p>

      <DebugPanel />
    </main>
  );
}

export const dynamic = "force-dynamic";
