"use client";

import { useState } from "react";

interface Props {
  /** Where the form is placed — passed to Brevo as SOURCE attribute */
  source?: string;
  /** Visual variant */
  variant?: "default" | "hero";
}

export function EmailSignup({ source = "website", variant = "default" }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "exists" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) return;

    setStatus("saving");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus(data.exists ? "exists" : "done");
        if (!data.exists) setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const isHero = variant === "hero";

  if (status === "done") {
    return (
      <div
        style={{
          padding: "14px 20px",
          background: "var(--green-bg)",
          border: "1.5px solid var(--green-pastel)",
          fontSize: "var(--body)",
          fontWeight: 600,
          color: "var(--green)",
          maxWidth: isHero ? 420 : undefined,
        }}
      >
        You&rsquo;re on the list. We&rsquo;ll keep you posted.
      </div>
    );
  }

  if (status === "exists") {
    return (
      <div
        style={{
          padding: "14px 20px",
          background: "var(--peach-bg)",
          border: "1.5px solid var(--peach-pastel)",
          fontSize: "var(--body)",
          fontWeight: 600,
          color: "var(--peach)",
          maxWidth: isHero ? 420 : undefined,
        }}
      >
        You&rsquo;re already signed up — we&rsquo;ve got you.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        gap: 0,
        maxWidth: isHero ? 420 : 480,
        width: "100%",
      }}
    >
      <input
        type="email"
        required
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          flex: 1,
          padding: "12px 16px",
          fontSize: "var(--body)",
          fontWeight: 500,
          fontFamily: "inherit",
          border: "1.5px solid var(--border)",
          borderRight: "none",
          background: "var(--card)",
          color: "var(--text)",
          outline: "none",
          borderRadius: 0,
          minWidth: 0,
        }}
      />
      <button
        type="submit"
        disabled={status === "saving"}
        style={{
          padding: "12px 20px",
          fontSize: "var(--kicker)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          fontFamily: "inherit",
          background: "var(--peach)",
          color: "#fff",
          border: "1.5px solid var(--peach)",
          cursor: status === "saving" ? "wait" : "pointer",
          whiteSpace: "nowrap",
          borderRadius: 0,
        }}
      >
        {status === "saving" ? "…" : "Sign up"}
      </button>
      {status === "error" && (
        <div
          style={{
            position: "absolute",
            marginTop: 52,
            fontSize: "var(--micro)",
            color: "var(--peach)",
            fontWeight: 600,
          }}
        >
          Something went wrong — try again.
        </div>
      )}
    </form>
  );
}
