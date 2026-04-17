import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import { CommissionerAvatar } from "@/components/commissioner-avatar";
import { ProfileTabs } from "@/components/profile-tabs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("commissioners").select("name, district").eq("id", id).maybeSingle();
  if (!c) return {};
  return {
    title: `${c.name} · ${c.district} · PeachTracker Commission`,
    description: `Voting record for ${c.name}, Macon-Bibb County Commissioner for ${c.district}.`,
  };
}

export default async function CommissionerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: commissioner } = await supabase
    .from("commissioners")
    .select("id, name, district, image_url, bio, bio_sources, links")
    .eq("id", id)
    .maybeSingle();

  if (!commissioner) notFound();

  // Public social / web presence. Hand-curated in the commissioners.links column.
  // Not every commissioner has a public web presence — render only what we have.
  const links = Array.isArray(commissioner.links)
    ? (commissioner.links as CommissionerLink[]).filter((l) => l && typeof l.url === "string")
    : [];

  // Recent news pulled weekly by the cron job. Public RLS filters to visible only.
  // Bumped to 24 now that news has its own tab — more articles = more value
  // on the News surface without crowding the Votes view.
  const { data: news } = await supabase
    .from("commissioner_news")
    .select("id, source_url, source_name, title, snippet, published_at")
    .eq("commissioner_id", id)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(24);
  const newsCount = news?.length ?? 0;

  // All votes for this commissioner with meeting + item context
  const { data: votes } = await supabase
    .from("commission_votes")
    .select(`
      id, vote, notes,
      agenda_items (
        id, title, category, item_number,
        meetings ( id, meeting_date, meeting_type )
      )
    `)
    .eq("commissioner_id", id)
    .order("created_at", { ascending: false });

  const allVotes = (votes ?? []) as unknown as VoteWithContext[];

  // Stats
  const total = allVotes.length;
  const yes = allVotes.filter((v) => v.vote === "yes").length;
  const no = allVotes.filter((v) => v.vote === "no").length;
  const abstain = allVotes.filter((v) => v.vote === "abstain").length;
  // Don't round to 100% unless it actually is 100%. Makes the "356 yes / 1 no /
  // 100% yes rate" display make sense — a single dissent shows as 99.7%, not 100.
  const yesRateLabel = formatYesRate(yes, total);

  // Group by meeting date for display
  const byMeeting = new Map<string, { meeting: MeetingInfo; votes: VoteWithContext[] }>();
  for (const v of allVotes) {
    const m = v.agenda_items?.meetings;
    if (!m) continue;
    const key = m.id;
    if (!byMeeting.has(key)) {
      byMeeting.set(key, { meeting: m, votes: [] });
    }
    byMeeting.get(key)!.votes.push(v);
  }
  const meetingGroups = [...byMeeting.values()].sort(
    (a, b) => b.meeting.meeting_date.localeCompare(a.meeting.meeting_date),
  );

  // No votes — group separately
  const noVoteItems = allVotes.filter((v) => v.vote === "no");

  return (
    <>
      <AccentBar />
      <SiteNav />

      <main style={{ maxWidth: "var(--content)", margin: "0 auto", padding: "56px var(--gutter) 80px" }}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/commission" style={{ fontSize: "var(--body)", color: "var(--text-secondary)" }}>
            ← Commission tracker
          </Link>
        </div>

        <header style={{ borderBottom: "2px solid var(--text)", paddingBottom: 20, marginBottom: 40, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <CommissionerAvatar name={commissioner.name} src={commissioner.image_url} size={120} />
          <div>
            <p style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--peach)", marginBottom: 8 }}>
              {commissioner.district}
            </p>
            <h1 style={{ fontWeight: 900, fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.03em", lineHeight: 1.02 }}>
              {commissioner.name}
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--body)", marginTop: 8 }}>
              Macon-Bibb County Board of Commissioners
            </p>
            {links.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      border: "1.5px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--text)",
                      fontSize: "var(--micro)",
                      fontWeight: 600,
                      textDecoration: "none",
                      lineHeight: 1.2,
                    }}
                  >
                    <span aria-hidden="true">{linkIcon(l.type)}</span>
                    <span>{linkLabel(l)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Bio — short factual intro for readers who don't know this commissioner.
            Static enough to refresh manually every few months. */}
        {commissioner.bio && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderTop: "1.5px solid var(--border)", paddingTop: 12, marginBottom: 12 }}>
              About
            </div>
            <p style={{ fontSize: "var(--lead)", lineHeight: 1.55, color: "var(--text)", maxWidth: "72ch", fontWeight: 450 }}>
              {commissioner.bio}
            </p>
            {Array.isArray(commissioner.bio_sources) && commissioner.bio_sources.length > 0 && (
              <div style={{ marginTop: 10, fontSize: "var(--micro)", color: "var(--text-light)" }}>
                Sources:{" "}
                {(commissioner.bio_sources as string[]).map((url, i) => (
                  <span key={url}>
                    <a href={url} target="_blank" rel="noopener" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>
                      {hostFromUrl(url)}
                    </a>
                    {i < (commissioner.bio_sources as string[]).length - 1 && " · "}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Why-most-votes-are-yes note. Unanimous votes are the norm on most
            councils — items go through committee first, and commissioners often
            negotiate changes before a final vote. This is the context the
            average reader needs so "100% yes rate" doesn't read as a rubber stamp. */}
        {total > 20 && (
          <aside style={{
            background: "var(--green-bg, #f0fdf4)",
            border: "1.5px solid var(--green-pastel, #bbf7d0)",
            padding: "14px 18px",
            marginBottom: 24,
            fontSize: "var(--body)",
            color: "var(--text)",
            lineHeight: 1.5,
          }}>
            <strong>About these numbers:</strong> Most commission votes are unanimous
            because items are debated and amended in committee before they reach a
            formal vote. A high Yes rate is typical — the interesting part is where
            a commissioner breaks from the pack, which is why we highlight
            {no > 0 ? ` the ${no === 1 ? "dissenting vote" : `${no} dissenting votes`}` : " any dissent"} below.
          </aside>
        )}

        {/* Vote summary stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1.5px", background: "var(--border)", border: "1.5px solid var(--border)", marginBottom: 48 }}>
          {[
            { label: "Total votes", value: total, color: "var(--text)" },
            { label: "Yes", value: yes, color: "var(--green)" },
            { label: "No", value: no, color: "#DC2626" },
            { label: "Abstain", value: abstain, color: "var(--text-secondary)" },
            { label: "Yes rate", value: yesRateLabel, color: "var(--green)" },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "var(--card)", padding: "20px 24px" }}>
              <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>
                {stat.label}
              </div>
              <div style={{ fontWeight: 900, fontSize: "1.8rem", letterSpacing: "-0.02em", lineHeight: 1, color: stat.color, fontFeatureSettings: '"tnum" 1' }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Votes (default) | In the news tabs. Dissents + full voting record
            live inside the Votes tab so the top-of-page stats are always the
            first thing the reader sees. News gets its own surface. */}
        <ProfileTabs
          initial="votes"
          tabs={[
            {
              id: "votes",
              label: "Votes",
              count: total > 0 ? total : undefined,
              panel: (
                <>
                  {noVoteItems.length > 0 && (
                    <section style={{ marginBottom: 48 }}>
                      <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#DC2626", borderTop: "2px solid #DC2626", paddingTop: 12, marginBottom: 16 }}>
                        Dissenting votes ({noVoteItems.length})
                      </div>
                      <div style={{ background: "var(--border)", display: "grid", gap: "1.5px", border: "1.5px solid var(--border)" }}>
                        {noVoteItems.map((v) => {
                          const m = v.agenda_items?.meetings;
                          return (
                            <div key={v.id} style={{ background: "#fef2f2", padding: "16px 24px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: "var(--body)", color: "var(--text)" }}>
                                    {v.agenda_items?.title}
                                  </div>
                                  {m && (
                                    <div style={{ fontSize: "var(--micro)", color: "var(--text-secondary)", marginTop: 4, fontWeight: 500 }}>
                                      {meetingLabel(m.meeting_type)} · {formatDate(m.meeting_date)}
                                    </div>
                                  )}
                                  {v.notes && <div style={{ fontSize: "var(--micro)", color: "var(--text-secondary)", marginTop: 2 }}>{v.notes}</div>}
                                </div>
                                <span style={{ fontSize: "var(--kicker)", fontWeight: 700, color: "#DC2626", border: "1.5px solid #DC2626", padding: "4px 10px", textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
                                  No
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {total === 0 && (
                    <p style={{ color: "var(--text-secondary)" }}>
                      No votes recorded yet. Check back after the next commission meeting.
                    </p>
                  )}

                  {meetingGroups.map(({ meeting, votes: mVotes }) => (
                    <section key={meeting.id} style={{ marginBottom: 40 }}>
                      <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderTop: "1.5px solid var(--border)", paddingTop: 12, marginBottom: 16 }}>
                        {meetingLabel(meeting.meeting_type)} · {formatDate(meeting.meeting_date)}
                      </div>
                      <div style={{ background: "var(--border)", display: "grid", gap: "1.5px", border: "1.5px solid var(--border)" }}>
                        {mVotes.map((v) => (
                          <div key={v.id} style={{ background: v.vote === "no" ? "#fef2f2" : v.vote === "yes" ? "var(--green-bg)" : "var(--card)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                            <span style={{ fontSize: "var(--body)", fontWeight: 600, color: "var(--text)", flex: 1 }}>
                              {v.agenda_items?.item_number && <span style={{ color: "var(--text-light)", marginRight: 6 }}>{v.agenda_items.item_number}.</span>}
                              {v.agenda_items?.title}
                            </span>
                            <span style={{ fontSize: "var(--kicker)", fontWeight: 700, color: voteColor(v.vote), textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
                              {v.vote}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </>
              ),
            },
            {
              id: "news",
              label: "In the news",
              count: newsCount > 0 ? newsCount : undefined,
              panel: (
                <>
                  {newsCount === 0 ? (
                    <p style={{ color: "var(--text-secondary)" }}>
                      No recent news picked up for this commissioner. Headlines refresh every Monday from Google News.
                    </p>
                  ) : (
                    <>
                      {/* 2-col squarish cards. Auto-fit so it collapses to 1-col
                          on narrow viewports without explicit media queries. */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                          gap: 12,
                          marginBottom: 16,
                        }}
                      >
                        {(news ?? []).map((n) => {
                          const cleanTitle = n.source_name
                            ? stripTrailingSource(n.title, n.source_name)
                            : n.title;
                          return (
                            <a
                              key={n.id}
                              href={n.source_url}
                              target="_blank"
                              rel="noopener"
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "space-between",
                                gap: 12,
                                padding: "16px 18px",
                                minHeight: 160,
                                background: "var(--card)",
                                border: "1.5px solid var(--border)",
                                textDecoration: "none",
                                color: "var(--text)",
                                transition: "border-color 0.15s ease",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 700,
                                  fontSize: "var(--body)",
                                  lineHeight: 1.3,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 4,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {cleanTitle}
                              </div>
                              <div style={{ fontSize: "var(--micro)", color: "var(--text-light)", fontWeight: 500 }}>
                                {n.source_name ?? hostFromUrl(n.source_url)}
                                {n.published_at && <> · {formatDate(n.published_at.slice(0, 10))}</>}
                              </div>
                            </a>
                          );
                        })}
                      </div>
                      <p style={{ fontSize: "var(--micro)", color: "var(--text-light)" }}>
                        Headlines are pulled automatically from Google News. PeachTracker doesn&apos;t endorse or verify their reporting.
                      </p>
                    </>
                  )}
                </>
              ),
            },
          ]}
        />
      </main>

      <SiteFooter />
    </>
  );
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Google News headlines always end with " - Source Name". When we render the
// source on its own line, the suffix is redundant. Strip it only when it
// actually matches the source we'd otherwise repeat.
function stripTrailingSource(title: string, sourceName: string): string {
  const suffix = ` - ${sourceName}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function meetingLabel(type: string) {
  if (type === "regular") return "Commission Meeting";
  if (type === "work_session") return "Pre-Commission";
  if (type === "special") return "Special Called";
  return type;
}
function voteColor(vote: string) { return vote === "yes" ? "var(--green)" : vote === "no" ? "#DC2626" : "var(--text-secondary)"; }

// Simple unicode glyphs — no icon library dependency. If we get fancy later we
// can swap in SVGs, but for now this keeps the header light.
function linkIcon(type: CommissionerLink["type"] | undefined): string {
  switch (type) {
    case "facebook": return "f";
    case "twitter": return "𝕏";
    case "instagram": return "◎";
    case "website": return "↗";
    default: return "↗";
  }
}

function linkLabel(l: CommissionerLink): string {
  if (l.label) return l.label;
  switch (l.type) {
    case "facebook": return "Facebook";
    case "twitter": return "Twitter / X";
    case "instagram": return "Instagram";
    case "website": {
      try { return new URL(l.url).hostname.replace(/^www\./, ""); }
      catch { return "Website"; }
    }
    default: {
      try { return new URL(l.url).hostname.replace(/^www\./, ""); }
      catch { return "Link"; }
    }
  }
}

// Format the yes rate so we never round up to 100% if there's been any dissent.
// Integer percent for most ranges; one decimal when it would otherwise round to 100.
function formatYesRate(yes: number, total: number): string {
  if (total === 0) return "—";
  if (yes === total) return "100%";
  const pct = (yes / total) * 100;
  // If it would round up to 100 but isn't actually 100, show one decimal.
  if (pct > 99.5) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

interface CommissionerLink {
  type?: "website" | "facebook" | "twitter" | "instagram" | "other";
  label?: string;
  url: string;
}
interface MeetingInfo { id: string; meeting_date: string; meeting_type: string; }
interface VoteWithContext {
  id: string; vote: string; notes: string | null;
  agenda_items: { id: string; title: string; category: string | null; item_number: number; meetings: MeetingInfo } | null;
}

export const dynamic = "force-dynamic";
