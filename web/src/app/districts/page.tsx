import type { Metadata } from "next";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import DistrictMapLoader from "./district-map-loader";

export const metadata: Metadata = {
  title: "Find Your Districts — PeachTracker",
  description:
    "Look up your Macon-Bibb County commission district, congressional district, state senate, state house, and school district by address.",
  openGraph: {
    title: "Find Your Districts — PeachTracker",
    description:
      "Interactive district map for Macon-Bibb County. Search your address to find your commission, congressional, and legislative districts.",
  },
};

export default function DistrictsPage() {
  return (
    <>
      <AccentBar />
      <SiteNav />

      <section
        style={{
          borderBottom: "1.5px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content)",
            margin: "0 auto",
            padding: "48px var(--gutter) 40px",
          }}
        >
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--peach)",
              marginBottom: 8,
            }}
          >
            Civic Tools
          </div>
          <h1
            style={{
              fontWeight: 900,
              fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              color: "var(--text)",
              margin: 0,
            }}
          >
            Find your districts.
          </h1>
          <p
            style={{
              fontSize: "var(--lead)",
              color: "var(--text-secondary)",
              marginTop: 10,
              maxWidth: 640,
              lineHeight: 1.55,
              fontWeight: 450,
            }}
          >
            Enter your address to see which Macon-Bibb commission district,
            congressional district, and state legislative districts you live in.
            Toggle layers on and off to explore the map.
          </p>
        </div>
      </section>

      <section style={{ background: "var(--bg)" }}>
        <div
          style={{
            maxWidth: "var(--content)",
            margin: "0 auto",
            padding: "32px var(--gutter) 64px",
          }}
        >
          <DistrictMapLoader />
        </div>
      </section>

      <section className="disclaimer-band">
        <div className="disclaimer">
          <div className="disclaimer-label">A note on this data</div>
          <div className="disclaimer-body">
            Commission and Water Authority district boundaries are sourced
            from <strong>Macon-Bibb County GIS</strong>. Congressional, state
            legislative, and school district boundaries come from the{" "}
            <strong>U.S. Census Bureau TIGER/Line</strong> files. Representative
            names may not reflect recent elections. Always verify with your local
            Board of Elections.
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
