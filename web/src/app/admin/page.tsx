import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Election } from "@/lib/supabase/types";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const { data: elections } = await supabase
    .from("elections")
    .select("*")
    .order("election_date", { ascending: false });

  return (
    <main className="admin-shell">
      <h1 className="admin-h1">Election night control</h1>
      <p className="admin-sub">
        Pick an election to update vote counts. Changes push to the public site
        in real time.
      </p>

      {(!elections || elections.length === 0) && (
        <div className="admin-card">No elections yet.</div>
      )}

      {(elections ?? []).map((e: Election) => (
        <div key={e.id} className="admin-card">
          <div className="admin-card-h">
            <div>
              <div className="admin-card-title">{e.name}</div>
              <div className="admin-card-meta">
                {e.election_date} · {e.location} · status:{" "}
                <strong style={{ color: "var(--text)" }}>{e.status}</strong>
                {e.last_updated ? ` · updated ${e.last_updated}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link
                href={`/elections/${e.id}`}
                className="admin-btn admin-btn-ghost"
                prefetch={false}
              >
                View public
              </Link>
              <Link href={`/admin/elections/${e.id}`} className="admin-btn">
                Update votes →
              </Link>
            </div>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 32 }}>
        <Link href="/admin/account" className="admin-btn admin-btn-ghost">
          Change password
        </Link>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
