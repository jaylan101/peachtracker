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

      {/* Compact header — hidden on mobile to save space */}
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
            padding: "clamp(20px, 4vw, 52px) var(--gutter)",
          }}
        >
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--peach)",
              marginBottom: 10,
            }}
          >
            Civic AI · Macon-Bibb
          </div>
          <h1
            style={{
              fontWeight: 900,
              fontSize: "clamp(1.5rem, 4vw, 3rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              color: "white",
            }}
          >
            Ask <span style={{ color: "var(--peach)" }}>Mulberry</span>
          </h1>
        </div>
      </div>

      {/* Chat box — explicit height so it never grows the page */}
      <div
        style={{
          maxWidth: 760,
          width: "100%",
          margin: "0 auto",
          padding: "24px var(--gutter)",
          /*
           * height: calc(100svh - offset)
           * svh = small viewport height (excludes browser chrome on mobile)
           * offset = AccentBar(4px) + SiteNav(~52px) + compactHeader(~80px) + top/bottom padding(48px) = ~184px
           * On desktop the header is taller so we use a safe value; overflow just scrolls
           */
          height: "calc(100svh - 184px)",
          minHeight: 360,
          maxHeight: "calc(100svh - 160px)",
          boxSizing: "border-box" as React.CSSProperties["boxSizing"],
          display: "flex",
          flexDirection: "column" as React.CSSProperties["flexDirection"],
        }}
      >
        <MulberryFullPage />
      </div>

      {/* About Mulberry — below the fold, user scrolls if curious */}
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
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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
