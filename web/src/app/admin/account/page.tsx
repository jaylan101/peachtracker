import Link from "next/link";
import { changePassword } from "../_actions";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;

  return (
    <main className="admin-shell" style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/admin" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          ← Dashboard
        </Link>
      </div>
      <h1 className="admin-h1">Account</h1>
      <p className="admin-sub">
        Change your password. Use a strong, memorable one — you&rsquo;ll need it
        on election night.
      </p>

      {error && <div className="admin-error">{error}</div>}
      {ok && <div className="admin-ok" style={{ marginBottom: 12 }}>Password updated.</div>}

      <div className="admin-card">
        <form action={changePassword}>
          <div style={{ marginBottom: 12 }}>
            <label className="admin-label" htmlFor="new_password">
              New password (min 8 chars)
            </label>
            <input
              id="new_password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="admin-input"
            />
          </div>
          <button type="submit" className="admin-btn">
            Update password
          </button>
        </form>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
