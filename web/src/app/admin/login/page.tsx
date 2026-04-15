import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signIn } from "../_actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  // If already signed in, skip the form
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next || "/admin");

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-title">Admin sign in</div>
        <div className="login-sub">PeachTracker election tools</div>

        {error && <div className="admin-error">{error}</div>}

        <form action={signIn}>
          <input type="hidden" name="next" value={next ?? "/admin"} />
          <div className="login-field">
            <label className="admin-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="admin-input"
              defaultValue="jaylan@jaylanscott.com"
            />
          </div>
          <div className="login-field">
            <label className="admin-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="admin-input"
            />
          </div>
          <button
            type="submit"
            className="admin-btn"
            style={{ width: "100%", padding: "12px 18px", marginTop: 8 }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
