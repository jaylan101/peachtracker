import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import type { Election } from "@/lib/supabase/types";

// Civic landing page. No races visible here — just the Macon City Hall hero,
// a "next election" pointer card, and the editorial/why/footer strip from
// the production site. Blog and commission sections land in later phases.
export default async function Home() {
  const supabase = await createClient();

  // Pick the next upcoming or live election to surface on the hero card
  const { data: next } = await supabase
    .from("elections")
    .select("*")
    .in("status", ["upcoming", "live"])
    .order("election_date", { ascending: true })
    .limit(1)
    .maybeSingle<Election>();

  // Most recent certified/final election for the "latest results" link
  const { data: past } = await supabase
    .from("elections")
    .select("*")
    .in("status", ["final", "certified"])
    .order("election_date", { ascending: false })
    .limit(1)
    .maybeSingle<Election>();

  return (
    <>
      <AccentBar />
      <SiteNav />

      <div className="hero-band">
        {/* Autoplay aerial Macon footage. Muted + playsInline so iOS will
            actually start it without user interaction. mp4 first (smaller,
            broadly supported); .mov fallback for environments that prefer it. */}
        <video
          className="hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/images/macon-city-hall-banner.jpg"
        >
          {/* Compressed mp4 (~7.5MB) — broad browser support, fast on mobile. */}
          <source src="/images/hero-video.mp4" type="video/mp4" />
        </video>
        <div className="hero-gradient" aria-hidden />
        <section className="hero">
          <div>
            <h1 className="hero-title">
              A civic tracker for <em>Macon-Bibb County.</em>
            </h1>
            <p className="hero-desc">
              <strong>PeachTracker</strong> brings local elections, commission votes, and
              community reporting together in one place — so Macon knows what&rsquo;s
              happening in its own backyard.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
              {next && (
                <div className="hero-card" style={{ marginTop: 0 }}>
                  <div className="hero-card-label">Next on the calendar</div>
                  <div className="hero-card-title">{next.name}</div>
                  <div className="hero-card-meta">
                    {formatDate(next.election_date)} · {next.location}
                  </div>
                  <Link href={`/elections/${next.id}`} className="hero-card-link">
                    {next.status === "live" ? "Live now →" : "See what\u2019s on the ballot →"}
                  </Link>
                </div>
              )}
              {past && (
                <div className="hero-card" style={{ marginTop: 0 }}>
                  <div className="hero-card-label" style={{ color: "var(--text-secondary)" }}>
                    Latest results
                  </div>
                  <div className="hero-card-title">{past.name}</div>
                  <div className="hero-card-meta">
                    {formatDate(past.election_date)} · {past.location} ·{" "}
                    <span style={{ textTransform: "capitalize" }}>{past.status}</span>
                  </div>
                  <Link href={`/elections/${past.id}`} className="hero-card-link">
                    View results →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="editorial">
        <span className="editorial-label">On the ground</span>
        <p className="editorial-body">
          We show up at the Macon-Bibb Board of Elections on election night and post vote
          totals as each precinct reports. <strong>No algorithm, no estimate</strong> —
          just the numbers as they come in, delivered to you in minutes instead of hours.
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
            posted on this site are <strong>unofficial until certified</strong> by the
            Macon-Bibb County Board of Elections.
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

function formatDate(iso: string): string {
  // Parse as local date without timezone shifting (DATE type from Postgres)
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const dynamic = "force-dynamic";
