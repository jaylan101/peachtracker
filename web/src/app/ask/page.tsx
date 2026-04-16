import type { Metadata } from "next";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import { MulberryFullPage } from "@/components/mulberry-fullpage";

export const metadata: Metadata = {
  title: "Ask Mulberry — Macon-Bibb Civic Guide · PeachTracker",
  description:
    "Ask Mulberry anything about Macon-Bibb County — elections, commissioners, voting locations, local government, and more.",
};

export default function AskPage() {
  return (
    <>
      <AccentBar />
      <SiteNav />

      {/* Page header */}
      <div
        style={{
          background: "var(--text)",
          borderBottom: "2px solid var(--text)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content)",
            margin: "0 auto",
            padding: "56px var(--gutter) 52px",
          }}
        >
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--peach)",
              marginBottom: 14,
            }}
          >
            Civic AI · Macon-Bibb
          </div>
          <h1
            style={{
              fontWeight: 900,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              color: "white",
            }}
          >
            Ask <span style={{ color: "var(--peach)" }}>Mulberry</span>
          </h1>
          <p
            style={{
              fontSize: "var(--lead)",
              color: "rgba(255,255,255,0.65)",
              fontWeight: 450,
              marginTop: 16,
              lineHeight: 1.55,
              maxWidth: 540,
            }}
          >
            Your Macon-Bibb civic guide — trained on local elections, commission
            votes, voting logistics, and more. Ask anything.
          </p>
        </div>
      </div>

      {/* Main chat area */}
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "40px var(--gutter) 80px",
        }}
      >
        <MulberryFullPage />
      </div>

      {/* About Mulberry */}
      <div
        style={{
          background: "var(--peach-bg)",
          borderTop: "1.5px solid var(--peach-pastel)",
          borderBottom: "1.5px solid var(--peach-pastel)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content)",
            margin: "0 auto",
            padding: "56px var(--gutter)",
            display: "grid",
            gridTemplateColumns: "200px 1fr",
            gap: 40,
            alignItems: "start",
          }}
        >
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--peach)",
              borderTop: "2px solid var(--peach)",
              paddingTop: 10,
            }}
          >
            About Mulberry
          </div>
          <div>
            <p
              style={{
                fontSize: "var(--body)",
                color: "var(--text)",
                lineHeight: 1.65,
                fontWeight: 450,
                maxWidth: 620,
              }}
            >
              Mulberry is a local AI assistant built specifically for Macon-Bibb
              County. It&apos;s trained on PeachTracker&apos;s election data, commission
              vote records, voting logistics, and public government information —
              not the entire internet.
            </p>
            <p
              style={{
                fontSize: "var(--body)",
                color: "var(--text-secondary)",
                lineHeight: 1.65,
                fontWeight: 450,
                maxWidth: 620,
                marginTop: 12,
              }}
            >
              Mulberry runs on Gemma, Google&apos;s open-source AI model. Answers are
              generated from local data and may not reflect real-time changes.
              Always verify important civic information with official sources.
            </p>
          </div>
        </div>
      </div>

      <SiteFooter />
    </>
  );
}
