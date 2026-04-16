import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import type { Election } from "@/lib/supabase/types";

export default async function ElectionsPage() {
  const supabase = await createClient();

  const { data: elections } = await supabase
    .from("elections")
    .select("*")
    .order("election_date", { ascending: false });

  const upcoming = (elections ?? []).filter((e: Election) =>
    ["upcoming", "live"].includes(e.status),
  );
  const past = (elections ?? []).filter((e: Election) =>
    ["final", "certified"].includes(e.status),
  );

  return (
    <>
      <AccentBar />
      <SiteNav />

      <main
        style={{
          maxWidth: "var(--content)",
          margin: "0 auto",
          padding: "56px var(--gutter) 80px",
        }}
      >
        <header
          style={{
            borderBottom: "2px solid var(--text)",
            paddingBottom: 16,
            marginBottom: 40,
          }}
        >
          <p
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--peach)",
              marginBottom: 8,
            }}
          >
            Macon-Bibb County
          </p>
          <h1
            style={{
              fontWeight: 900,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            Elections
          </h1>
        </header>

        {upcoming.length > 0 && (
          <section style={{ marginBottom: 48 }}>
            <SectionLabel>Upcoming</SectionLabel>
            <ElectionList elections={upcoming} />
          </section>
        )}

        {past.length > 0 && (
          <section>
            <SectionLabel>Past elections</SectionLabel>
            <ElectionList elections={past} />
          </section>
        )}

        {(elections ?? []).length === 0 && (
          <p style={{ color: "var(--text-secondary)" }}>No elections yet.</p>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "var(--kicker)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: "var(--text-secondary)",
        borderTop: "1.5px solid var(--border)",
        paddingTop: 12,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

function ElectionList({ elections }: { elections: Election[] }) {
  return (
    <div
      style={{
        background: "var(--border)",
        border: "1.5px solid var(--border)",
        display: "grid",
        gap: "1.5px",
      }}
    >
      {elections.map((e) => (
        <Link
          key={e.id}
          href={`/elections/${e.id}`}
          style={{
            background: "var(--card)",
            padding: "20px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
            textDecoration: "none",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "var(--kicker)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: statusColor(e.status),
                marginBottom: 4,
              }}
            >
              {e.status}
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: "1.1rem",
                letterSpacing: "-0.015em",
                color: "var(--text)",
              }}
            >
              {e.name}
            </div>
            <div
              style={{
                fontSize: "var(--micro)",
                color: "var(--text-secondary)",
                marginTop: 4,
                fontWeight: 500,
              }}
            >
              {formatDate(e.election_date)} · {e.location}
            </div>
          </div>
          <span
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--peach)",
              whiteSpace: "nowrap",
            }}
          >
            View →
          </span>
        </Link>
      ))}
    </div>
  );
}

function statusColor(status: string): string {
  if (status === "live") return "var(--green)";
  if (status === "upcoming") return "var(--peach)";
  return "var(--text-light)";
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const dynamic = "force-dynamic";
