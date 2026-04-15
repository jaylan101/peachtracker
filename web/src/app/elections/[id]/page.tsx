import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import { ElectionLive } from "./_components/election-live";
import type { Candidate, Race, UnopposedRace } from "@/lib/supabase/types";

export default async function ElectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: election, error: electionErr },
    { data: races, error: racesErr },
    { data: candidates, error: candidatesErr },
    { data: unopposed, error: unopposedErr },
  ] = await Promise.all([
    supabase.from("elections").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("races")
      .select("*")
      .eq("election_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("candidates")
      .select("*, races!inner(election_id)")
      .eq("races.election_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("unopposed_races")
      .select("*")
      .eq("election_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  if (electionErr || racesErr || candidatesErr || unopposedErr) {
    throw new Error(
      electionErr?.message ??
        racesErr?.message ??
        candidatesErr?.message ??
        unopposedErr?.message,
    );
  }
  if (!election) notFound();

  return (
    <>
      <AccentBar />
      <SiteNav />

      <ElectionLive
        election={election}
        initialRaces={(races ?? []) as Race[]}
        initialCandidates={(candidates ?? []) as Candidate[]}
      />

      {(unopposed ?? []).length > 0 && (
        <UnopposedSection items={(unopposed ?? []) as UnopposedRace[]} />
      )}

      <section className="editorial">
        <span className="editorial-label">On the ground</span>
        <p className="editorial-body">
          We&rsquo;re on-site at the Macon-Bibb Board of Elections on election night,
          entering vote totals into this page by hand as each precinct reports.{" "}
          <strong>No algorithm, no estimate</strong> — just the numbers posted in the
          lobby, delivered to you in minutes instead of hours.
        </p>
      </section>

      <section className="why">
        <div className="why-inner">
          <h2 className="why-title">
            Because Macon <em>deserves to know.</em>
          </h2>
          <div>
            <p className="why-text">
              Local election results in Macon-Bibb are delivered the old-fashioned way —
              on paper, in person, at the Board of Elections lobby. That&rsquo;s how the
              county has always done it, and PeachTracker doesn&rsquo;t change a thing
              about how it works.
            </p>
            <p className="why-text">
              We just thought it&rsquo;d be nice if folks who couldn&rsquo;t make it down
              there could still follow along. So we show up, watch the numbers come in,
              and post them here. A community project, for the community.
            </p>
          </div>
        </div>
      </section>

      <section className="disclaimer-band">
        <div className="disclaimer">
          <div className="disclaimer-label">A note on these results</div>
          <div className="disclaimer-body">
            PeachTracker is not affiliated with Macon-Bibb County government. Results
            displayed here are <strong>unofficial until certified</strong> by the
            Macon-Bibb County Board of Elections. A small number of provisional ballots
            may remain to be counted.
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

function UnopposedSection({ items }: { items: UnopposedRace[] }) {
  return (
    <section className="unop-section">
      <div className="unop-head">
        <div className="unop-label">Also on the ballot</div>
        <div className="unop-title">Unopposed races</div>
        <div className="unop-note">
          These seats have only one candidate filed and won&rsquo;t appear as a
          contested race on the ballot. Listed here for transparency.
        </div>
      </div>
      <div className="unop-grid">
        {items.map((u) => {
          const badgeClass =
            u.type === "democratic"
              ? "unop-badge dem"
              : u.type === "republican"
                ? "unop-badge rep"
                : "unop-badge";
          const badgeLabel =
            u.type === "democratic"
              ? "Democratic"
              : u.type === "republican"
                ? "Republican"
                : "Nonpartisan";
          return (
            <div key={u.id} className="unop-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div className="unop-race">{u.name}</div>
                <span className={badgeClass}>{badgeLabel}</span>
              </div>
              <div className="unop-candidate">
                {u.candidate_name}
                {u.incumbent && (
                  <span className="unop-incumbent">(Incumbent)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export const dynamic = "force-dynamic";
