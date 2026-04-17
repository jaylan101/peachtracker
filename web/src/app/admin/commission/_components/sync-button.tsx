"use client";

import { useState } from "react";

export function SyncCivicClerkButton() {
  const [status, setStatus] = useState<"idle" | "phase1" | "phase2" | "done" | "error">("idle");
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  async function sync(full = false) {
    setStatus("phase1");
    setLog([]);
    setProgress({ done: 0, total: 0 });

    try {
      // Phase 1: sync meeting rows (fast)
      addLog(full
        ? "Full backfill — fetching every commission meeting from CivicClerk..."
        : "Fetching meetings from CivicClerk...");
      const url = full
        ? "/api/sync-civicclerk?phase=meetings&full=1"
        : "/api/sync-civicclerk?phase=meetings";
      const r1 = await fetch(url, { method: "POST" });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error ?? "Phase 1 failed");

      addLog(`✓ ${d1.meetingsSynced} meetings synced from CivicClerk`);

      // Also fetch ALL meeting IDs from DB — catches manually-inserted meetings
      // that aren't returned by the Events API (e.g. March 18 2026 event 2401).
      const allDbResp = await fetch("/api/sync-civicclerk?phase=all-meeting-ids", { method: "POST" });
      const allDbData = allDbResp.ok ? await allDbResp.json() : { meetingIds: [] };
      const phase1Ids: string[] = d1.meetingIds ?? [];
      const phase1Set = new Set(phase1Ids);
      const extraIds: string[] = (allDbData.meetingIds ?? []).filter((id: string) => !phase1Set.has(id));
      if (extraIds.length > 0) addLog(`+ ${extraIds.length} additional DB meetings to process`);
      const ids: string[] = [...phase1Ids, ...extraIds];
      setProgress({ done: 0, total: ids.length });

      if (ids.length === 0) {
        setStatus("done");
        return;
      }

      // Phase 2: sync agenda items + votes per meeting (sequential, one at a time)
      setStatus("phase2");
      let totalItems = 0;
      let totalVotes = 0;

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const r2 = await fetch(`/api/sync-civicclerk?phase=items&id=${id}`, { method: "POST" });
        const d2 = await r2.json();
        if (r2.ok) {
          totalItems += d2.itemsSynced ?? 0;
          totalVotes += d2.votesSynced ?? 0;
        }
        setProgress({ done: i + 1, total: ids.length });
      }

      addLog(`✓ ${totalItems} agenda items, ${totalVotes} vote records`);
      setStatus("done");
    } catch (e) {
      addLog(`✗ ${String(e)}`);
      setStatus("error");
    }
  }

  const isRunning = status === "phase1" || status === "phase2";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => sync(false)} disabled={isRunning} className="admin-btn">
          {isRunning ? "Syncing…" : "↻ Sync meetings from CivicClerk"}
        </button>
        <button
          onClick={() => sync(true)}
          disabled={isRunning}
          className="admin-btn"
          title="Walks every page of CivicClerk Events. Only needed to backfill older meetings; normal sync is incremental and fast."
          style={{ background: "var(--card)", color: "var(--text)" }}
        >
          Full backfill
        </button>
        {status === "phase2" && progress.total > 0 && (
          <span style={{ fontSize: "var(--body)", color: "var(--text-secondary)", fontWeight: 600 }}>
            Meeting {progress.done}/{progress.total}
          </span>
        )}
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
