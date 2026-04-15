import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateRaceVotes, updateElectionSettings } from "../../_actions";
import type { Candidate, Election, Race } from "@/lib/supabase/types";

// Vote-update page. One form per race so saves are scoped small — admin can
// save a single race without waiting for all 8 to submit. Target: update 8
// races in under 2 minutes on election night.
export default async function AdminElectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: election },
    { data: races },
    { data: candidates },
  ] = await Promise.all([
    supabase.from("elections").select("*").eq("id", id).maybeSingle<Election>(),
    supabase
      .from("races")
      .select("*")
      .eq("election_id", id)
      .order("sort_order"),
    supabase
      .from("candidates")
      .select("*, races!inner(election_id)")
      .eq("races.election_id", id)
      .order("sort_order"),
  ]);

  if (!election) notFound();

  const byRace = new Map<string, Candidate[]>();
  for (const c of (candidates ?? []) as Candidate[]) {
    const list = byRace.get(c.race_id) ?? [];
    list.push(c);
    byRace.set(c.race_id, list);
  }

  return (
    <main className="admin-shell">
      <div style={{ marginBottom: 8 }}>
        <Link
          href="/admin"
          style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
        >
          ← All elections
        </Link>
      </div>
      <h1 className="admin-h1">{election.name}</h1>
      <p className="admin-sub">
        {election.election_date} · {election.location} · status:{" "}
        <strong>{election.status}</strong>
      </p>

      {/* Election settings */}
      <div className="admin-card">
        <div className="admin-card-title" style={{ marginBottom: 12 }}>
          Election settings
        </div>
        <form action={updateElectionSettings} className="admin-grid-2">
          <input type="hidden" name="id" value={election.id} />
          <div>
            <label className="admin-label" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={election.status}
              className="admin-select"
            >
              <option value="upcoming">upcoming</option>
              <option value="live">live</option>
              <option value="final">final</option>
              <option value="certified">certified</option>
            </select>
          </div>
          <div>
            <label className="admin-label" htmlFor="last_updated">
              Last updated (free text)
            </label>
            <input
              id="last_updated"
              name="last_updated"
              type="text"
              placeholder='e.g. "8:29 PM — 4 of 6 precincts"'
              defaultValue={election.last_updated ?? ""}
              className="admin-input"
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="admin-btn admin-btn-ghost">
              Save settings
            </button>
          </div>
        </form>
      </div>

      {/* One form per race */}
      <h2
        style={{
          marginTop: 32,
          marginBottom: 12,
          fontSize: "1.1rem",
          fontWeight: 800,
        }}
      >
        Races ({(races ?? []).length})
      </h2>

      {((races ?? []) as Race[]).map((race) => {
        const cands = byRace.get(race.id) ?? [];
        return (
          <form
            key={race.id}
            action={updateRaceVotes}
            className="admin-race"
          >
            <input type="hidden" name="race_id" value={race.id} />
            <input type="hidden" name="election_id" value={election.id} />

            <div className="admin-race-head">
              <div>
                <div className="admin-race-title">{race.name}</div>
                <div className="admin-race-meta">
                  {race.category} · {race.type} · {cands.length} candidate
                  {cands.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="admin-race-meta">
                Currently {race.precincts_reporting}/{race.total_precincts}{" "}
                precincts
                {race.called && race.winner ? ` · CALLED: ${race.winner}` : ""}
              </div>
            </div>

            <div className="admin-race-body">
              {/* Candidate vote inputs */}
              {cands.map((c) => (
                <div key={c.id} className="admin-cand-row">
                  <div className="admin-cand-name">
                    {c.name}
                    {c.incumbent && <small>Incumbent</small>}
                  </div>
                  <input
                    name={`votes:${c.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={c.votes}
                    className="admin-input"
                    style={{ textAlign: "right" }}
                    aria-label={`${c.name} votes`}
                  />
                </div>
              ))}

              {/* Precinct counts */}
              <div className="admin-precincts">
                <div>
                  <label className="admin-label">Precincts reporting</label>
                  <input
                    name="precincts_reporting"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={race.precincts_reporting}
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="admin-label">Total precincts</label>
                  <input
                    name="total_precincts"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    defaultValue={race.total_precincts}
                    className="admin-input"
                  />
                </div>
              </div>

              {/* Snapshot note (optional) */}
              <div style={{ marginTop: 12 }}>
                <label className="admin-label">Snapshot note (optional)</label>
                <input
                  name="snapshot_note"
                  type="text"
                  placeholder='e.g. "Early vote", "First precinct in"'
                  className="admin-input"
                />
              </div>

              {/* Call + save */}
              <div className="admin-race-actions">
                <label className="admin-called">
                  <input
                    type="checkbox"
                    name="called"
                    defaultChecked={race.called}
                  />
                  Call this race
                  <input
                    name="winner"
                    type="text"
                    placeholder="Winner name"
                    defaultValue={race.winner ?? ""}
                    className="admin-called-winner"
                  />
                </label>
                <button type="submit" className="admin-btn">
                  Save {race.name.split(" ").slice(-2).join(" ")}
                </button>
              </div>
            </div>
          </form>
        );
      })}
    </main>
  );
}

export const dynamic = "force-dynamic";
