import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";

export default async function CommissionPage() {
  const supabase = await createClient();

  const [{ data: meetings }, { data: commissioners }] = await Promise.all([
    supabase
      .from("meetings")
      .select(`
        id, meeting_date, meeting_type, agenda_url,
        agenda_items (
          id, item_number, title, summary_eli5, category,
          commission_votes (
            id, vote, notes,
            commissioners ( id, name, district )
          )
        )
      `)
      .order("meeting_date", { ascending: false })
      .limit(12),
    supabase
      .from("commissioners")
      .select(`
        id, name, district,
        commission_votes ( id, vote )
      `)
      .eq("active", true)
      .order("district"),
  ]);

  return (
    <>
      <AccentBar />
      <SiteNav />

      <main style={{ maxWidth: "var(--content)", margin: "0 auto", padding: "56px var(--gutter) 80px" }}>
        <header style={{ borderBottom: "2px solid var(--text)", paddingBottom: 16, marginBottom: 40 }}>
          <p style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--peach)", marginBottom: 8 }}>
            Macon-Bibb County
          </p>
          <h1 style={{ fontWeight: 900, fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.03em", lineHeight: 1.02 }}>
            Commission tracker
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--lead)", marginTop: 12, fontWeight: 450, maxWidth: "60ch" }}>
            Meeting dates sync automatically from{" "}
            <a href="https://maconbibbcoga.portal.civicclerk.com" target="_blank" rel="noopener" style={{ color: "var(--peach)", fontWeight: 600 }}>
              CivicClerk
            </a>. Agenda items and votes are added as meetings are published.
          </p>
        </header>

        {/* Commissioner cards */}
        {commissioners && commissioners.length > 0 && (
          <section style={{ marginBottom: 56 }}>
            <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderTop: "1.5px solid var(--border)", paddingTop: 12, marginBottom: 16 }}>
              Commissioners
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1.5px", background: "var(--border)", border: "1.5px solid var(--border)" }}>
              {(commissioners as CommissionerRow[]).map((c) => {
                const total = c.commission_votes?.length ?? 0;
                const yes = c.commission_votes?.filter((v) => v.vote === "yes").length ?? 0;
                const pct = total > 0 ? Math.round((yes / total) * 100) : null;
                return (
                  <Link
                    key={c.id}
                    href={`/commission/${c.id}`}
                    style={{ background: "var(--card)", padding: "16px 20px", textDecoration: "none", display: "block" }}
                  >
                    <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", marginBottom: 4 }}>
                      {c.district}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)", letterSpacing: "-0.01em" }}>
                      {c.name}
                    </div>
                    {pct !== null && (
                      <div style={{ fontSize: "var(--micro)", color: "var(--text-light)", marginTop: 6, fontWeight: 500 }}>
                        {pct}% yes · {total} votes
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Meeting list */}
        {(!meetings || meetings.length === 0) && (
          <div style={{ padding: "40px 0", color: "var(--text-secondary)" }}>
            No meetings yet — check back after the next sync.
          </div>
        )}

        {(meetings as unknown as MeetingRow[] ?? []).map((m) => (
          <MeetingCard key={m.id} meeting={m} />
        ))}
      </main>

      <SiteFooter />
    </>
  );
}

function MeetingCard({ meeting: m }: { meeting: MeetingRow }) {
  const items = (m.agenda_items ?? []).sort((a, b) => a.item_number - b.item_number);
  const label = meetingLabel(m.meeting_type);
  const dateStr = new Date(m.meeting_date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ borderTop: "1.5px solid var(--border)", paddingTop: 16, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 4 }}>
            {label}
          </div>
          <div style={{ fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.015em" }}>
            {dateStr}
          </div>
        </div>
        {m.agenda_url && (
          <a href={m.agenda_url} target="_blank" rel="noopener" style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--peach)", textDecoration: "none" }}>
            Full agenda ↗
          </a>
        )}
      </div>

      {items.length === 0 && (
        <div style={{ background: "var(--card)", border: "1.5px solid var(--border)", padding: "20px 24px", color: "var(--text-secondary)", fontSize: "var(--body)" }}>
          Agenda items will be added after the meeting.
        </div>
      )}

      {items.length > 0 && (
        <div style={{ background: "var(--border)", display: "grid", gap: "1.5px", border: "1.5px solid var(--border)" }}>
          {items.map((item) => (
            <AgendaItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgendaItemRow({ item }: { item: AgendaItemRow }) {
  const votes = item.commission_votes ?? [];
  const yes = votes.filter((v) => v.vote === "yes").length;
  const no = votes.filter((v) => v.vote === "no").length;
  const abstain = votes.filter((v) => v.vote === "abstain").length;
  const hasVotes = votes.length > 0;

  return (
    <div style={{ background: "var(--card)", padding: "16px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text)" }}>
            {item.item_number && <span style={{ color: "var(--text-light)", fontWeight: 500, marginRight: 8, fontSize: "var(--body)" }}>{item.item_number}.</span>}
            {item.title}
          </div>
          {item.summary_eli5 && (
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--body)", marginTop: 6, lineHeight: 1.55, fontWeight: 450, maxWidth: "70ch" }}>
              {item.summary_eli5}
            </p>
          )}
          {item.category && (
            <span style={{ display: "inline-block", marginTop: 6, fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-light)", background: "var(--border)", padding: "3px 8px" }}>
              {item.category.replace(/_/g, " ")}
            </span>
          )}
        </div>
        {hasVotes && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
            {yes > 0 && <VotePill label={`${yes} Yes`} color="var(--green)" />}
            {no > 0 && <VotePill label={`${no} No`} color="#DC2626" />}
            {abstain > 0 && <VotePill label={`${abstain} Abstain`} color="var(--text-secondary)" />}
          </div>
        )}
      </div>
      {hasVotes && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {votes.map((v) => v.commissioners && (
            <Link
              key={v.id}
              href={`/commission/${v.commissioners.id}`}
              style={{ fontSize: "var(--micro)", fontWeight: 600, padding: "3px 8px", background: voteBackground(v.vote), color: voteColor(v.vote), textDecoration: "none" }}
            >
              {v.commissioners.name.split(" ").slice(-1)[0]} — {v.vote}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function VotePill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: "var(--kicker)", fontWeight: 700, padding: "4px 10px", border: `1.5px solid ${color}`, color, textTransform: "uppercase", letterSpacing: "0.1em" }}>
      {label}
    </span>
  );
}

function voteBackground(vote: string) { return vote === "yes" ? "var(--green-bg)" : vote === "no" ? "#fef2f2" : "var(--bg)"; }
function voteColor(vote: string) { return vote === "yes" ? "var(--green)" : vote === "no" ? "#DC2626" : "var(--text-secondary)"; }
function meetingLabel(type: string) {
  if (type === "regular") return "Commission Meeting";
  if (type === "work_session") return "Pre-Commission / Work Session";
  if (type === "special") return "Special Called Meeting";
  if (type === "committee") return "Committee Meeting";
  return type;
}

type VoteRow = { id: string; vote: string; notes: string | null; commissioners: { id: string; name: string; district: string } | null };
type AgendaItemRow = { id: string; item_number: number; title: string; summary_eli5: string | null; category: string | null; commission_votes: VoteRow[] };
type MeetingRow = { id: string; meeting_date: string; meeting_type: string; agenda_url: string | null; agenda_items: AgendaItemRow[] };
type CommissionerRow = { id: string; name: string; district: string; commission_votes: { id: string; vote: string }[] };

export const dynamic = "force-dynamic";
