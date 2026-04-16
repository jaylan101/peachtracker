import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./_actions";
import "./admin.css";

// Admin shell — topbar with brand + sign out, then page content.
// Auth gate is enforced in middleware.ts, so if we render this, a user session
// exists. We still fetch the profile to double-check is_admin and to show who
// is signed in.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If there's a user, fetch their profile to gate on is_admin.
  // Login page uses this layout too (middleware exempts it), so we tolerate
  // no-user (user will be null on /admin/login).
  let email: string | null = null;
  let isAdmin = false;
  if (user) {
    email = user.email ?? null;
    // Use the SECURITY DEFINER is_admin() RPC — bypasses RLS entirely, so it
    // works even if the caller can't SELECT profiles directly.
    const { data: isAdminRpc } = await supabase.rpc("is_admin");
    isAdmin = isAdminRpc === true;
  }

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <Link href="/admin" className="admin-brand">
          PeachTracker <span className="admin-brand-tag">Admin</span>
        </Link>
        {user && (
          <div className="admin-topbar-nav">
            <Link href="/" prefetch={false}>
              ← Public site
            </Link>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>{email}</span>
            <form action={signOut}>
              <button type="submit" className="admin-signout">
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>

      {user && !isAdmin ? (
        <main className="admin-shell">
          <div className="admin-error">
            Your account is signed in but not marked as admin. Contact the site
            owner to grant access.
          </div>
        </main>
      ) : (
        children
      )}
    </div>
  );
}
