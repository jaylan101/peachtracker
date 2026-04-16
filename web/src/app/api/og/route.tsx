import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const electionId = searchParams.get("election");

  // Default card for the home page / unknown routes
  let title = "PeachTracker";
  let subtitle = "Live election results · Macon-Bibb County";
  let isLive = false;
  let statusLabel = "";

  if (electionId) {
    try {
      const supabase = await createClient();
      const { data: election } = await supabase
        .from("elections")
        .select("name, status, election_date, last_updated")
        .eq("id", electionId)
        .maybeSingle();

      if (election) {
        title = election.name;
        isLive = election.status === "live";
        statusLabel =
          election.status === "live"
            ? "Live now"
            : election.status === "upcoming"
              ? "Upcoming"
              : election.status === "certified"
                ? "Certified"
                : "Final results";
        subtitle = `${election.election_date} · Macon-Bibb County`;
        if (election.last_updated && election.status === "live") {
          subtitle = `Updated ${election.last_updated} · Macon-Bibb County`;
        }
      }
    } catch {
      // Fall through to defaults
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#F7F5F2",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Peach accent bar */}
        <div style={{ height: 12, backgroundColor: "#E0956E", display: "flex" }} />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 72px",
          }}
        >
          {/* Top: eyebrow + live badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "#E0956E",
              }}
            >
              PeachTracker
            </span>
            {statusLabel && (
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: isLive ? "#ffffff" : "#87817A",
                  backgroundColor: isLive ? "#5E9470" : "#E0DCD6",
                  padding: "6px 16px",
                  display: "flex",
                }}
              >
                {statusLabel}
              </span>
            )}
          </div>

          {/* Middle: election name */}
          <div
            style={{
              fontSize: title.length > 40 ? 52 : 64,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              color: "#2A2725",
              display: "flex",
              maxWidth: 900,
            }}
          >
            {title}
          </div>

          {/* Bottom: subtitle + location */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <span
              style={{
                fontSize: 24,
                color: "#87817A",
                fontWeight: 500,
              }}
            >
              {subtitle}
            </span>
            <span
              style={{
                fontSize: 20,
                color: "#B5AFA8",
                fontWeight: 500,
                letterSpacing: "0.04em",
              }}
            >
              peachtracker.vercel.app
            </span>
          </div>
        </div>

        {/* Bottom accent */}
        <div style={{ height: 6, backgroundColor: "#FDF0E8", display: "flex" }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
