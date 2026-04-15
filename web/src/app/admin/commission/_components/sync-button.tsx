"use client";

import { useState } from "react";

export function SyncCivicClerkButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<string>("");

  async function sync() {
    setStatus("loading");
    try {
      const res = await fetch("/api/sync-civicclerk", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      const details = [
        `${data.meetingsSynced ?? 0} meetings`,
        data.itemsSynced ? `${data.itemsSynced} agenda items` : null,
        data.votesSynced ? `${data.votesSynced} votes` : null,
      ].filter(Boolean).join(", ");
      setResult(`Synced: ${details}`);
      if (data.errors?.length) {
        console.warn("Sync errors:", data.errors);
      }
      setStatus("done");
    } catch (e) {
      setResult(String(e));
      setStatus("error");
    }
  }

  return (
    <div>
      <button
        onClick={sync}
        disabled={status === "loading"}
        className="admin-btn"
      >
        {status === "loading" ? "Syncing…" : "↻ Sync meetings from CivicClerk"}
      </button>
      {status === "done" && (
        <div className="admin-ok" style={{ marginTop: 8, display: "inline-block", padding: "6px 12px" }}>
          {result}
        </div>
      )}
      {status === "error" && (
        <div className="admin-error" style={{ marginTop: 8 }}>
          {result}
        </div>
      )}
    </div>
  );
}
