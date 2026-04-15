"use client";

// Landing page for password reset. Supabase sends a magic link that
// includes a code in the URL hash. We exchange it and redirect to the
// account page where the user sets a new password.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Supabase puts the session tokens in the URL hash after redirect.
    // createClient will pick them up automatically on mount.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        setError("Reset link is invalid or expired. Request a new one.");
        setStatus("error");
      } else {
        setStatus("ready");
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setSaving(false);
    } else {
      router.push("/admin?reset=done");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-title">Set new password</div>
        <div className="login-sub">PeachTracker Admin</div>

        {status === "loading" && (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Verifying reset link…
          </p>
        )}

        {status === "error" && (
          <>
            <div className="admin-error">{error}</div>
            <a
              href="/admin/login"
              style={{
                display: "block",
                textAlign: "center",
                color: "var(--peach)",
                fontWeight: 600,
                fontSize: "0.9rem",
                marginTop: 12,
              }}
            >
              ← Back to sign in
            </a>
          </>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit}>
            {error && <div className="admin-error" style={{ marginBottom: 12 }}>{error}</div>}
            <div className="login-field">
              <label className="admin-label" htmlFor="password">
                New password (min 8 chars)
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="admin-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="admin-btn"
              disabled={saving}
              style={{ width: "100%", padding: "12px 18px", marginTop: 8 }}
            >
              {saving ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
