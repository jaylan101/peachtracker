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
      // Phase 1: sync meeting rows
      //
      // Full backfill walks every page (~34 pages, ~506 events) so we can't
      // do it in one request — Vercel caps functions at 60s. Instead we loop
      // page-by-page, each request pulls ~15 events and stays under a second.
      // Normal (incremental) sync is already fast and does everything in one.
      let phase1Ids: string[] = [];
      let totalMeetings = 0;

      if (full) {
        addLog("Full backfill — fetching every commission meeting from CivicClerk...");
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 50) {
          const pr = await fetch(
            `/api/sync-civicclerk?phase=meetings&full=1&page=${page}`,
            { method: "POST" },
          );
          const pd = await pr.json();
          if (!pr.ok) throw new Error(pd.error ?? `Full backfill page ${page} failed`);
          totalMeetings += pd.meetingsSynced ?? 0;
          phase1Ids.push(...(pd.meetingIds ?? []));
          const range = pd.dateRange ? ` (${pd.dateRange.newest} → ${pd.dateRange.oldest})` : "";
          addLog(`  page ${page}: +${pd.meetingsSynced ?? 0}${range}`);
          hasMore = Boolean(pd.hasMore);
          page++;
        }
        addLog(`✓ ${totalMeetings} meetings synced across ${page - 1} pages`);
      } else {
        addLog("Fetching meetings from CivicClerk...");
        const r1 = await fetch("/api/sync-civicclerk?phase=meetings", { method: "POST" });
        const d1 = await r1.json();
        if (!r1.ok) throw new Error(d1.error ?? "Phase 1 failed");
        totalMeetings = d1.meetingsSynced ?? 0;
        phase1Ids = d1.meetingIds ?? [];
        addLog(`✓ ${totalMeetings} meetings synced from CivicClerk`);
      }

      // Also fetch ALL meeting IDs from DB — catches manually-inserted meetings
      // that aren't returned by the Events API (e.g. March 18 2026 event 2401).
      const allDbResp = await fetch("/api/sync-civicclerk?phase=all-meeting-ids", { method: "POST" });
      const allDbData = allDbResp.ok ? await allDbResp.json() : { meetingIds: [] };
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
