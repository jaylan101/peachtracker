"use client";

import { useState } from "react";

export function ManualSyncButton() {
  const [agendaId, setAgendaId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState("");

  async function sync() {
    const id = agendaId.trim();
    if (!id || isNaN(parseInt(id))) { setResult("Enter a valid numeric agenda ID"); setStatus("error"); return; }
    setStatus("loading");
    setResult("");
    const r = await fetch(`/api/sync-civicclerk?phase=sync-by-agendaid&agendaid=${id}`, { method: "POST" });
    const d = await r.json();
    if (!r.ok) { setResult(d.error ?? "Failed"); setStatus("error"); return; }
    setResult(`✓ Agenda ${id}: ${d.itemsSynced ?? 0} items, ${d.votesSynced ?? 0} votes. Refresh page to see meeting.`);
    setStatus("done");
    setAgendaId("");
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div>
        <label className="admin-label">CivicClerk Agenda ID</label>
        <input
          type="number"
          value={agendaId}
          onChange={(e) => setAgendaId(e.target.value)}
          placeholder="e.g. 2011"
          className="admin-input"
          style={{ width: 140 }}
          onKeyDown={(e) => e.key === "Enter" && sync()}
        />
      </div>
      <button
        onClick={sync}
        disabled={status === "loading"}
        className="admin-btn admin-btn-ghost"
        style={{ alignSelf: "flex-end" }}
      >
        {status === "loading" ? "Syncing…" : "Sync this meeting"}
      </button>
      {result && (
        <div
          style={{
            flexBasis: "100%",
            marginTop: 8,
            padding: "8px 12px",
            fontSize: "var(--body)",
            fontWeight: 600,
            background: status === "error" ? "#fef2f2" : "var(--green-bg)",
            border: `1.5px solid ${status === "error" ? "#fecaca" : "var(--green-pastel)"}`,
            color: status === "error" ? "#991b1b" : "#14532d",
          }}
        >
          {result}
        </div>
      )}
    </div>
  );
}
