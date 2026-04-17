// Individual meeting detail page.
//
// One meeting at a time so the overview page stays fast and scrollable.
// Shows: header (date + type + links out), agenda item list with per-item
// vote breakdowns. Dissents are highlighted; unanimous votes get a simple
// roll-call line underneath.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("meetings")
    .select("meeting_date, meeting_type")
    .eq("id", id)
    .maybeSingle();
  if (!m) return {};
  const label = meetingLabel(m.meeting_type);
  const date = formatDate(m.meeting_date);
  return {
    title: `${label} · ${date} · PeachTracker`,
    description: `Agenda items and recorded votes from the Macon-Bibb County ${label.toLowerCase()} on ${date}.`,
  };
}

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, meeting_date, meeting_type, agenda_url, minutes_url, civicclerk_event_id")
    .eq("id", id)
    .maybeSingle();

  if (!meeting) notFound();

  const { data: items } = await supabase
    .from("agenda_items")
    .select(`
      id, title, category, item_number, description,
      commission_votes (
        id, vote, notes,
        commissioners ( id, name, district )
      )
    `)
    .eq("meeting_id", id)
    .order("item_number", { ascending: true });

  const agendaItems = (items as unknown as AgendaItem[]) ?? [];

  // Roll-up stats
  const totalItems = agendaItems.length;
  const itemsWithVotes = agendaItems.filter((i) => (i.commission_votes ?? []).length > 0).length;
  const contestedItems = agendaItems.filter((i) =>
    (i.commission_votes ?? []).some((v) => v.vote === "no"),
  ).length;

  const isFuture = meeting.meeting_date > new Date().toISOString().slice(0, 10);
  const label = meetingLabel(meeting.meeting_type);
  const dateStr = formatDate(meeting.meeting_date);

  return (
    <>
      <AccentBar />
      <SiteNav />

      <main style={{ maxWidth: "var(--content)", margin: "0 auto", padding: "56px var(--gutter) 80px" }}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/commission" style={{ fontSize: "var(--body)", color: "var(--text-secondary)" }}>
            ← All meetings
          </Link>
        </div>

        <header style={{ borderBottom: "2px solid var(--text)", paddingBottom: 20, marginBottom: 32 }}>
          <p style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--peach)", marginBottom: 8 }}>
            {label}
          </p>
          <h1 style={{ fontWeight: 900, fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.03em", lineHeight: 1.02 }}>
            {dateStr}
          </h1>
          <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", fontSize: "var(--body)" }}>
            {meeting.agenda_url && (
              <a href={meeting.agenda_url} target="_blank" rel="noopener" style={{ color: "var(--peach)", fontWeight: 600 }}>
                Official agenda (CivicClerk) →
              </a>
            )}
          </div>
        </header>

        {/* Stat strip */}
        {totalItems > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1.5px", background: "var(--border)", border: "1.5px solid var(--border)", marginBottom: 40 }}>
            {[
              { label: "Agenda items", value: totalItems, color: "var(--text)" },
              { label: "With votes", value: itemsWithVotes, color: "var(--text)" },
              { label: "Contested", value: contestedItems, color: contestedItems > 0 ? "#DC2626" : "var(--text-secondary)" },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "var(--card)", padding: "18px 20px" }}>
                <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>
                  {stat.label}
                </div>
                <div style={{ fontWeight: 900, fontSize: "1.6rem", letterSpacing: "-0.02em", lineHeight: 1, color: stat.color, fontFeatureSettings: '"tnum" 1' }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalItems === 0 && (
          <div style={{ padding: "32px", background: "var(--card)", border: "1.5px solid var(--border)", textAlign: "center" }}>
            <p style={{ fontSize: "var(--lead)", color: "var(--text-secondary)", fontWeight: 500 }}>
              {isFuture
                ? "Agenda not yet available. This meeting is upcoming — items appear once CivicClerk publishes them."
                : "No agenda items synced for this meeting yet."}
            </p>
          </div>
        )}

        {/* Agenda items */}
        {agendaItems.map((item) => (
          <AgendaItemCard key={item.id} item={item} />
        ))}
      </main>

      <SiteFooter />
    </>
  );
}

function AgendaItemCard({ item }: { item: AgendaItem }) {
  const votes = item.commission_votes ?? [];
  const yes = votes.filter((v) => v.vote === "yes");
  const no = votes.filter((v) => v.vote === "no");
  const abstain = votes.filter((v) => v.vote === "abstain");
  const hasDissent = no.length > 0;

  return (
    <section
      style={{
        borderLeft: hasDissent ? "3px solid #DC2626" : "3px solid var(--border)",
        paddingLeft: 20,
        marginBottom: 28,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 6, flexWrap: "wrap" }}>
        {item.item_number != null && (
          <span style={{ fontSize: "var(--kicker)", fontWeight: 800, color: "var(--text-light)", fontFeatureSettings: '"tnum" 1' }}>
            {item.item_number}.
          </span>
        )}
        {item.category && (
          <span style={{ fontSize: "var(--micro)", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {item.category}
          </span>
        )}
      </div>
      <h2 style={{ fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.01em", lineHeight: 1.3, marginBottom: 10 }}>
        {item.title}
      </h2>
      {item.description && (
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--body)", marginBottom: 12, lineHeight: 1.5 }}>
          {item.description}
        </p>
      )}

      {votes.length === 0 ? (
        <p style={{ fontSize: "var(--micro)", color: "var(--text-light)", fontWeight: 500 }}>
          No recorded vote.
        </p>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: hasDissent ? 10 : 6, fontSize: "var(--micro)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            <span style={{ color: "var(--green)" }}>{yes.length} Yes</span>
            {no.length > 0 && <span style={{ color: "#DC2626" }}>{no.length} No</span>}
            {abstain.length > 0 && <span style={{ color: "var(--text-secondary)" }}>{abstain.length} Abstain</span>}
          </div>

          {/* If contested, show who voted No. Otherwise just a compact list. */}
          {hasDissent && (
            <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", padding: "10px 14px", marginBottom: 8 }}>
              <div style={{ fontSize: "var(--micro)", fontWeight: 700, color: "#991b1b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                Voted No
              </div>
              <div style={{ fontSize: "var(--body)", color: "var(--text)", fontWeight: 600 }}>
                {no.map((v, i) => (
                  <span key={v.id}>
                    {v.commissioners ? (
                      <Link href={`/commission/${v.commissioners.id}`} style={{ color: "var(--text)", textDecoration: "underline" }}>
                        {v.commissioners.name}
                      </Link>
                    ) : (
                      "Unknown"
                    )}
                    {v.commissioners?.district && (
                      <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}> ({v.commissioners.district})</span>
                    )}
                    {i < no.length - 1 && <span>, </span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          <details style={{ fontSize: "var(--micro)", color: "var(--text-secondary)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--text-light)" }}>
              Full roll call
            </summary>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 4 }}>
              {votes.map((v) => (
                <div key={v.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--text)", fontWeight: 500 }}>
                    {v.commissioners?.name ?? "Unknown"}
                  </span>
                  <span style={{ fontWeight: 700, color: voteColor(v.vote), textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {v.vote}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function voteColor(vote: string) {
  if (vote === "yes") return "var(--green)";
  if (vote === "no") return "#DC2626";
  return "var(--text-secondary)";
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function meetingLabel(type: string) {
  if (type === "regular") return "Commission Meeting";
  if (type === "work_session") return "Pre-Commission / Work Session";
  if (type === "special") return "Special Called Meeting";
  if (type === "committee") return "Committee Meeting";
  return type;
}

interface VoteRow {
  id: string; vote: string; notes: string | null;
  commissioners: { id: string; name: string; district: string } | null;
}
interface AgendaItem {
  id: string; title: string; category: string | null;
  item_number: number | null; description: string | null;
  commission_votes: VoteRow[];
}

export const dynamic = "force-dynamic";
