import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import { ElectionLive } from "./_components/election-live";
import type { Candidate, Election, Race, UnopposedRace } from "@/lib/supabase/types";

// Statewide link-outs for the May 19 primary. Georgia SoS handles everything
// outside Macon-Bibb. These are static — they don't change between elections.
const STATEWIDE_LINKS = [
  { name: "Governor",              url: "https://results.enr.clarityelections.com/GA/", note: "Democratic & Republican primaries" },
  { name: "U.S. Senate",          url: "https://results.enr.clarityelections.com/GA/", note: "Jon Ossoff (D) incumbent" },
  { name: "Lieutenant Governor",  url: "https://results.enr.clarityelections.com/GA/", note: "Open seat" },
  { name: "Secretary of State",   url: "https://results.enr.clarityelections.com/GA/", note: "Democratic & Republican primaries" },
  { name: "Attorney General",     url: "https://results.enr.clarityelections.com/GA/", note: "Democratic & Republican primaries" },
  { name: "All Statewide Results",url: "https://results.enr.clarityelections.com/GA/", note: "Georgia Secretary of State" },
];

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
    // Grab a few other elections for the cross-link section.
    // We don't know the current election's status yet, so we fetch both
    // upcoming and past and let the render logic pick the right slice.
    { data: allElections },
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
    supabase
      .from("elections")
      .select("id, name, election_date, status")
      .neq("id", id)
      .order("election_date", { ascending: false })
      .limit(10),
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

  const contestedRaces = (races ?? []) as Race[];
  const unopposedRaces = (unopposed ?? []) as UnopposedRace[];
  const hasUnopposed = unopposedRaces.length > 0;
  const showStatewide = contestedRaces.some((r) => r.category === "State Legislature");

  // If current election is past → surface upcoming ones ("what's coming up").
  // If current election is upcoming/live → surface past ones ("recent results").
  const isPast = ["final", "certified"].includes(election.status);
  const crossLinkElections = ((allElections ?? []) as Pick<Election, "id" | "name" | "election_date" | "status">[])
    .filter((e) =>
      isPast
        ? ["upcoming", "live"].includes(e.status)
        : ["final", "certified"].includes(e.status),
    )
    .slice(0, 3);

  return (
    <>
      <AccentBar />
      <SiteNav />

      {/* Coverage transparency band — above the race results */}
      <section className="coverage-band">
        <div className="coverage-inner">
          <div className="coverage-label">What PeachTracker covers</div>
          <div className="coverage-body">
            <p>
              We track every <strong>contested local race</strong> on the{" "}
              {election.name} ballot in {election.location} — Board of
              Education, Water Authority, and State Legislature primaries. We
              show up to the Board of Elections on election night and enter
              results by hand as precincts report.
            </p>
            {hasUnopposed && (
              <p>
                Some races on your ballot are <strong>unopposed</strong> — one
                candidate filed and no one challenged them. Those races have no
                results to report, so we note them below but don&rsquo;t track
                vote totals. For statewide races like Governor and U.S. Senate,
                we link out to the Georgia Secretary of State&rsquo;s official
                results page.
              </p>
            )}
            <p>
              If a race you care about isn&rsquo;t here, it&rsquo;s either
              unopposed or outside {election.location}. We&rsquo;d rather be
              honest about our scope than pretend to cover everything.
            </p>
          </div>
        </div>
      </section>

      {/* Race cards — realtime */}
      <ElectionLive
        election={election}
        initialRaces={contestedRaces}
        initialCandidates={(candidates ?? []) as Candidate[]}
      />

      {/* Unopposed races grid */}
      {hasUnopposed && <UnopposedSection items={unopposedRaces} />}

      {/* Statewide link-out — only when there are state legislature races */}
      {showStatewide && <StatewideSection />}

      {/* Contextual cross-link — only renders when there are relevant elections */}
      {crossLinkElections.length > 0 && (
        <section style={{ background: "var(--bg)", borderTop: "1.5px solid var(--border)" }}>
          <div style={{ maxWidth: "var(--content)", margin: "0 auto", padding: "40px var(--gutter)" }}>
            <div
              style={{
                fontSize: "var(--kicker)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "var(--text-secondary)",
                marginBottom: 16,
              }}
            >
              {/* On a past/certified election: point forward. On upcoming: show history. */}
              {["final", "certified"].includes(election.status)
                ? "What's coming up"
                : "Past elections"}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {crossLinkElections.map((e) => (
                <Link
                  key={e.id}
                  href={`/elections/${e.id}`}
                  style={{
                    border: "1.5px solid var(--border)",
                    background: "var(--card)",
                    padding: "10px 16px",
                    textDecoration: "none",
                    color: "var(--text)",
                    fontSize: "var(--body)",
                    fontWeight: 600,
                  }}
                >
                  {e.name}{" "}
                  <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
                    {e.election_date}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
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
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div className="unop-race">{u.name}</div>
                <span className={badgeClass}>{badgeLabel}</span>
              </div>
              <div className="unop-candidate">
                {u.candidate_name}
                {u.incumbent && <span className="unop-incumbent">(Incumbent)</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatewideSection() {
  return (
    <div className="statewide-band">
      <section className="statewide">
        <div className="statewide-header">
          <div className="statewide-title">Statewide races</div>
          <p className="statewide-note">
            PeachTracker only covers Macon-Bibb County. For Governor, U.S. Senate,
            and other statewide races, results are on the Georgia Secretary of
            State&rsquo;s official site.
          </p>
        </div>
        <div className="statewide-links">
          {STATEWIDE_LINKS.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="statewide-link"
            >
              <span className="statewide-link-name">{link.name}</span>
              <span className="statewide-link-note">{link.note}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

export const dynamic = "force-dynamic";
