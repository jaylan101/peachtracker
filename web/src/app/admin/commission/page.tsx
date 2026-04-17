import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SyncCivicClerkButton } from "./_components/sync-button";
import { ManualSyncButton } from "./_components/manual-sync-button";
import { addAgendaItem, addVote } from "./_actions";

// Commission admin — shows synced meetings and lets you add agenda items
// and commissioner votes manually (until we get a bearer token from the city).
export default async function CommissionAdminPage() {
  const supabase = await createClient();

  const { data: meetings } = await supabase
    .from("meetings")
    .select("*, agenda_items(id, title, summary_eli5, category, commission_votes(id))")
    .order("meeting_date", { ascending: false })
    .limit(20);

  const { data: commissioners } = await supabase
    .from("commissioners")
    .select("id, name, district")
    .eq("active", true)
    .order("district");

  return (
    <main className="admin-shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h1 className="admin-h1">Commission tracker</h1>
        <Link href="/admin" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          ← Dashboard
        </Link>
      </div>
      <p className="admin-sub">
        Meetings sync from CivicClerk automatically. Add agenda items + votes manually
        until the city grants API access for that data.
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <SyncCivicClerkButton />
        <a
          href="https://maconbibbcoga.portal.civicclerk.com/events"
          target="_blank"
          rel="noopener"
          className="admin-btn admin-btn-ghost"
        >
          Open CivicClerk portal ↗
        </a>
      </div>

      {/* Manual sync by agenda ID — for meetings not in Events API */}
      <div className="admin-card" style={{ marginBottom: 28 }}>
        <div className="admin-card-title" style={{ marginBottom: 8 }}>Sync specific meeting by agenda ID</div>
        <p style={{ fontSize: "var(--body)", color: "var(--text-secondary)", marginBottom: 12 }}>
          For meetings with published minutes that don&rsquo;t appear in the auto-sync (e.g. 2025 meetings).
          Find the agenda ID in the CivicClerk URL: <code style={{ fontSize: "0.8rem" }}>portal.civicclerk.com/event/<strong>[eventId]</strong>/overview</code> — use the number after <code>/event/</code>. Known 2025 IDs with data: 2011, 2012, 2013, 2014, 2017, 2018, 2019.
        </p>
        <ManualSyncButton />
      </div>

      {commissioners && commissioners.length === 0 && (
        <div className="admin-error" style={{ marginBottom: 16 }}>
          No commissioners in the database yet.{" "}
          <Link href="/admin/commission/commissioners">Add commissioners →</Link>
        </div>
      )}

      {(!meetings || meetings.length === 0) && (
        <div className="admin-card">
          No meetings yet — click "Sync from CivicClerk" to pull in the meeting schedule.
        </div>
      )}

      {(meetings ?? []).map((m: MeetingRow) => (
        <div key={m.id} className="admin-race" style={{ marginBottom: 16 }}>
          <div className="admin-race-head">
            <div>
              <div className="admin-race-title">
                {m.meeting_date} —{" "}
                {m.meeting_type === "regular"
                  ? "Commission Meeting"
                  : m.meeting_type === "work_session"
                    ? "Pre-Commission / Work Session"
                    : m.meeting_type === "special"
                      ? "Special Called Meeting"
                      : m.meeting_type}
              </div>
              <div className="admin-race-meta">
                {m.agenda_items?.length ?? 0} agenda items
                {m.agenda_url && (
                  <>
                    {" · "}
                    <a href={m.agenda_url} target="_blank" rel="noopener" style={{ color: "var(--peach)" }}>
                      View agenda ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="admin-race-body">
            {/* Existing agenda items */}
            {(m.agenda_items ?? []).map((item: AgendaItemRow) => (
              <div
                key={item.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "var(--body)",
                }}
              >
                <strong>{item.title}</strong>
                {item.category && (
                  <span style={{ color: "var(--text-light)", marginLeft: 8, fontSize: "var(--kicker)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {item.category}
                  </span>
                )}
                {item.summary_eli5 && (
                  <p style={{ color: "var(--text-secondary)", marginTop: 4, fontSize: "var(--body)" }}>
                    {item.summary_eli5}
                  </p>
                )}
                <div style={{ fontSize: "var(--micro)", color: "var(--text-light)", marginTop: 4 }}>
                  {item.commission_votes?.length ?? 0} vote records
                </div>
              </div>
            ))}

            {/* Add agenda item form */}
            <form action={addAgendaItem} style={{ marginTop: 12 }}>
              <input type="hidden" name="meeting_id" value={m.id} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "end" }}>
                <div>
                  <label className="admin-label">Add agenda item</label>
                  <input name="title" type="text" placeholder="Item title" className="admin-input" required />
                </div>
                <div>
                  <label className="admin-label">Category</label>
                  <select name="category" className="admin-select" style={{ width: 160 }}>
                    <option value="">—</option>
                    <option value="public_safety">Public safety</option>
                    <option value="zoning">Zoning</option>
                    <option value="budget">Budget</option>
                    <option value="infrastructure">Infrastructure</option>
                    <option value="education">Education</option>
                    <option value="housing">Housing</option>
                    <option value="economic_development">Economic dev</option>
                    <option value="parks_recreation">Parks</option>
                    <option value="administrative">Administrative</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <button type="submit" className="admin-btn" style={{ alignSelf: "flex-end" }}>
                  Add
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <label className="admin-label">ELI5 summary (optional)</label>
                <input name="summary_eli5" type="text" placeholder="Plain-English explanation of this item" className="admin-input" />
              </div>
            </form>
          </div>
        </div>
      ))}
    </main>
  );
}

type AgendaItemRow = {
  id: string;
  title: string;
  summary_eli5: string | null;
  category: string | null;
  commission_votes: { id: string }[];
};

type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_type: string;
  agenda_url: string | null;
  agenda_items: AgendaItemRow[];
};

export const dynamic = "force-dynamic";
