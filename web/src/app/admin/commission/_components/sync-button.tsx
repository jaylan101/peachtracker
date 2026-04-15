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
      setResult(`Synced ${data.synced} meetings (${data.skipped} already up to date)`);
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
