import Link from "next/link";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import { EmailSignup } from "@/components/email-signup";

export const metadata = {
  title: "About — PeachTracker",
  description:
    "What PeachTracker is, what we believe, and why we built it for Macon-Bibb County.",
};

export default function AboutPage() {
  return (
    <>
      <AccentBar />
      <SiteNav />

      {/* Hero */}
      <section
        style={{
          background: "var(--peach-bg)",
          borderBottom: "1.5px solid var(--peach-pastel)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content)",
            margin: "0 auto",
            padding: "80px var(--gutter) 72px",
          }}
        >
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--peach)",
              marginBottom: 12,
            }}
          >
            About PeachTracker
          </div>
          <h1
            style={{
              fontWeight: 900,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
              maxWidth: 680,
            }}
          >
            We believe government should be{" "}
            <span style={{ color: "var(--peach)" }}>easy to understand.</span>
          </h1>
          <p
            style={{
              fontSize: "var(--lead)",
              color: "var(--text)",
              lineHeight: 1.55,
              fontWeight: 450,
              marginTop: 20,
              maxWidth: 600,
            }}
          >
            PeachTracker is a community project built in Macon, for Macon. We
            track elections, explain how local government works, and put civic
            information where people can actually find it.
          </p>
        </div>
      </section>

      {/* What we are */}
      <section
        style={{
          maxWidth: "var(--content)",
          margin: "0 auto",
          padding: "64px var(--gutter) 56px",
        }}
      >
        <div className="about-sidebar-grid">
          <span
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--peach)",
              paddingTop: 6,
              borderTop: "2px solid var(--peach)",
              display: "inline-block",
            }}
          >
            What we are
          </span>
          <div style={{ maxWidth: 640 }}>
            <p
              style={{
                fontSize: "1.1rem",
                fontWeight: 450,
                lineHeight: 1.6,
                color: "var(--text)",
              }}
            >
              PeachTracker started because election results in Macon-Bibb are
              still delivered the old-fashioned way — on paper, at the Board of
              Elections office. If you can&rsquo;t make it down there on election
              night, you wait. We thought that could be better.
            </p>
            <p
              style={{
                fontSize: "1.1rem",
                fontWeight: 450,
                lineHeight: 1.6,
                color: "var(--text)",
                marginTop: 16,
              }}
            >
              So we show up, watch the numbers come in, and post them here. But
              PeachTracker is more than results. Through{" "}
              <Link
                href="/blog"
                style={{
                  color: "var(--peach)",
                  fontWeight: 600,
                  textDecoration: "none",
                  borderBottom: "1.5px solid var(--peach-pastel)",
                }}
              >
                Civic Desk
              </Link>
              , we break down what the commission does, what&rsquo;s on the
              ballot, and what decisions actually mean for the people who live
              here. No spin. No agenda. Just clarity.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section
        style={{
          background: "var(--card)",
          borderTop: "1.5px solid var(--border)",
          borderBottom: "1.5px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content)",
            margin: "0 auto",
            padding: "72px var(--gutter)",
          }}
        >
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--peach)",
              marginBottom: 8,
            }}
          >
            What we believe
          </div>
          <h2
            style={{
              fontWeight: 900,
              fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              marginBottom: 48,
            }}
          >
            Our values
          </h2>

          <div className="about-values-grid">
            {/* Value 1 — Truth & Transparency */}
            <div style={{ background: "var(--bg)", padding: "36px 32px" }}>
              <div
                style={{
                  fontSize: "var(--kicker)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "var(--peach)",
                  marginBottom: 14,
                }}
              >
                Truth &amp; Transparency
              </div>
              <p
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 450,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  marginBottom: 20,
                }}
              >
                We present the facts and let people draw their own conclusions.
                No endorsements, no slant, no algorithm deciding what you see.
                Every vote total, every commission decision — reported as it
                happened.
              </p>
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 16,
                }}
              >
                <p
                  style={{
                    fontSize: "var(--body)",
                    fontStyle: "italic",
                    color: "var(--text-secondary)",
                    lineHeight: 1.55,
                    fontWeight: 450,
                  }}
                >
                  &ldquo;Then you will know the truth, and the truth will set you
                  free.&rdquo;
                </p>
                <p
                  style={{
                    fontSize: "var(--micro)",
                    color: "var(--text-light)",
                    fontWeight: 600,
                    marginTop: 6,
                    letterSpacing: "0.04em",
                  }}
                >
                  John 8:32
                </p>
              </div>
            </div>

            {/* Value 2 — Accessibility */}
            <div style={{ background: "var(--bg)", padding: "36px 32px" }}>
              <div
                style={{
                  fontSize: "var(--kicker)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "var(--peach)",
                  marginBottom: 14,
                }}
              >
                Accessibility
              </div>
              <p
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 450,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  marginBottom: 20,
                }}
              >
                Government information shouldn&rsquo;t require a law degree to
                understand. We take ordinances, agendas, and election data and
                explain them in plain language — so everyone in Macon can
                participate, not just the people who already know the system.
              </p>
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 16,
                }}
              >
                <p
                  style={{
                    fontSize: "var(--body)",
                    fontStyle: "italic",
                    color: "var(--text-secondary)",
                    lineHeight: 1.55,
                    fontWeight: 450,
                  }}
                >
                  &ldquo;Where there is no vision, the people perish.&rdquo;
                </p>
                <p
                  style={{
                    fontSize: "var(--micro)",
                    color: "var(--text-light)",
                    fontWeight: 600,
                    marginTop: 6,
                    letterSpacing: "0.04em",
                  }}
                >
                  Proverbs 29:18
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who's behind it */}
      <section
        style={{
          maxWidth: "var(--content)",
          margin: "0 auto",
          padding: "64px var(--gutter) 56px",
        }}
      >
        <div className="about-sidebar-grid">
          <span
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--peach)",
              paddingTop: 6,
              borderTop: "2px solid var(--peach)",
              display: "inline-block",
            }}
          >
            Who&rsquo;s behind this
          </span>
          <div style={{ maxWidth: 640 }}>
            <div className="about-founder-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="about-founder-img"
                src="/images/founder-headshot.jpg"
                alt="Jaylan Scott"
              />
              <p
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 450,
                  lineHeight: 1.6,
                  color: "var(--text)",
                }}
              >
                PeachTracker is built and maintained by{" "}
                <strong>Jaylan Scott</strong> — born and raised in Macon, Georgia.
                This isn&rsquo;t a media company or a political operation.
                It&rsquo;s a community tool, built because the information should
                be accessible to the people it affects most.
              </p>
            </div>
            <div className="about-founder-scripture">
              <p
                style={{
                  fontSize: "var(--body)",
                  fontStyle: "italic",
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                  fontWeight: 450,
                  marginTop: 20,
                }}
              >
                &ldquo;Iron sharpens iron, and one man sharpens another.&rdquo;
              </p>
              <p
                style={{
                  fontSize: "var(--micro)",
                  color: "var(--text-light)",
                  fontWeight: 600,
                  marginTop: 6,
                  letterSpacing: "0.04em",
                }}
              >
                Proverbs 27:17
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        style={{
          background: "var(--peach-bg)",
          borderTop: "1.5px solid var(--peach-pastel)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content)",
            margin: "0 auto",
            padding: "56px var(--gutter)",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontWeight: 900,
              fontSize: "clamp(1.5rem, 2.8vw, 2rem)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              marginBottom: 16,
            }}
          >
            Want to stay in the loop?
          </h2>
          <p
            style={{
              fontSize: "var(--lead)",
              color: "var(--text-secondary)",
              fontWeight: 450,
              marginBottom: 28,
            }}
          >
            Follow along with elections, commission coverage, and Civic Desk
            explainers.
          </p>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <EmailSignup source="about-cta" />
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/elections"
              style={{
                display: "inline-block",
                fontSize: "var(--kicker)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "var(--text)",
                textDecoration: "none",
                borderBottom: "2px solid var(--peach)",
                paddingBottom: 3,
              }}
            >
              Elections →
            </Link>
            <Link
              href="/blog"
              style={{
                display: "inline-block",
                fontSize: "var(--kicker)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "var(--text)",
                textDecoration: "none",
                borderBottom: "2px solid var(--peach)",
                paddingBottom: 3,
              }}
            >
              Civic Desk →
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
