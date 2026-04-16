"use client";

import { useState } from "react";

interface Props {
  /** Where the form is placed — passed to Brevo as SOURCE attribute */
  source?: string;
  /** Visual variant */
  variant?: "default" | "hero";
}

export function EmailSignup({ source = "website", variant = "default" }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "exists" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) return;

    setStatus("saving");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          source,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus(data.exists ? "exists" : "done");
        if (!data.exists) {
          setEmail("");
          setFirstName("");
          setLastName("");
        }
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

  const inputBase: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "var(--body)",
    fontWeight: 500,
    fontFamily: "inherit",
    border: "1.5px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    outline: "none",
    borderRadius: 0,
    minWidth: 0,
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: isHero ? 420 : 480,
        width: "100%",
      }}
    >
      {/* Name row */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          style={{ ...inputBase, flex: 1 }}
        />
        <input
          type="text"
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          style={{ ...inputBase, flex: 1 }}
        />
      </div>

      {/* Email + submit row */}
      <div style={{ display: "flex", gap: 0 }}>
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            ...inputBase,
            flex: 1,
            borderRight: "none",
          }}
        />
        <button
          type="submit"
          disabled={status === "saving"}
          style={{
            padding: "10px 20px",
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
      </div>

      {status === "error" && (
        <div
          style={{
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
