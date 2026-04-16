import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import type { Election } from "@/lib/supabase/types";

// Civic landing page.
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

  // Latest 2 published blog posts for the Civic Desk teaser
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, title, slug, excerpt, cover_image, author, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(2);

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

      {/* Civic Desk blog teaser — only renders if posts exist */}
      {posts && posts.length > 0 && (
        <section style={{ borderTop: "1.5px solid var(--border)", background: "var(--bg)" }}>
          <div style={{ maxWidth: "var(--content)", margin: "0 auto", padding: "56px var(--gutter) 64px" }}>
            {/* Section header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              borderBottom: "2px solid var(--text)",
              paddingBottom: 14,
              marginBottom: 24,
              gap: 16,
            }}>
              <div>
                <div style={{
                  fontSize: "var(--kicker)",
                  fontWeight: 700,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.16em",
                  color: "var(--peach)",
                  marginBottom: 6,
                }}>
                  Civic Desk
                </div>
                <div style={{
                  fontWeight: 800,
                  fontSize: "1.25rem",
                  letterSpacing: "-0.015em",
                }}>
                  Context for what&rsquo;s on the ballot
                </div>
              </div>
              <Link href="/blog" style={{
                fontSize: "var(--kicker)",
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.14em",
                color: "var(--text)",
                textDecoration: "none",
                borderBottom: "2px solid var(--peach)",
                paddingBottom: 3,
                whiteSpace: "nowrap" as const,
              }}>
                All posts →
              </Link>
            </div>

            {/* Post cards */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: "1.5px",
              background: "var(--border)",
              border: "1.5px solid var(--border)",
            }}>
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  style={{ textDecoration: "none", display: "block", background: "var(--card)" }}
                >
                  {post.cover_image ? (
                    <div style={{ height: 180, overflow: "hidden", borderBottom: "1.5px solid var(--border)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={post.cover_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  ) : (
                    <div style={{
                      height: 180,
                      background: "var(--peach-bg)",
                      borderBottom: "1.5px solid var(--peach-pastel)",
                      display: "flex",
                      alignItems: "flex-end",
                      padding: "16px 24px",
                    }}>
                      <span style={{ fontWeight: 900, fontSize: "3rem", color: "var(--peach-pastel)", letterSpacing: "-0.04em", lineHeight: 1 }}>PT</span>
                    </div>
                  )}
                  <div style={{ padding: "20px 24px 24px" }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: "1.1rem",
                      letterSpacing: "-0.015em",
                      lineHeight: 1.25,
                      color: "var(--text)",
                      marginBottom: 8,
                    }}>
                      {post.title}
                    </div>
                    {post.excerpt && (
                      <div style={{
                        fontSize: "var(--body)",
                        color: "var(--text-secondary)",
                        lineHeight: 1.55,
                        fontWeight: 450,
                        marginBottom: 14,
                      }}>
                        {post.excerpt}
                      </div>
                    )}
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      borderTop: "1px solid var(--border)",
                      paddingTop: 12,
                      fontSize: "var(--micro)",
                      fontWeight: 500,
                    }}>
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>By {post.author}</span>
                      {post.published_at && (
                        <span style={{ color: "var(--text-light)" }}>
                          {new Date(post.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

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
