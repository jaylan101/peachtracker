// Commission tracker overview page.
//
// Top:     commissioner grid, sorted by extracted district number, with
//          placeholder avatars (we have image_url support in the schema
//          but no images uploaded yet).
// Middle:  search + year + type + vote-shape filters. URL-driven so the
//          page stays server-rendered and shareable.
// Bottom:  paginated meeting list (20 per page). Click-through to
//          /commission/meeting/[id] for full agenda + vote detail.
//
// With ~500 meetings in the DB rendering them all inline would be unusable,
// so we dropped nested agenda items here. Everything clicks through.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";

const PAGE_SIZE = 20;

interface SearchParams {
  q?: string;
  year?: string;
  type?: string;
  votes?: string;
  page?: string;
}

export default async function CommissionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const year = params.year ?? "all";
  const meetingType = params.type ?? "all";
  const voteShape = params.votes ?? "all";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const supabase = await createClient();

  // Commissioners — always render top, sorted by district number.
  const { data: commissioners } = await supabase
    .from("commissioners")
    .select(`id, name, district, image_url, commission_votes ( id, vote )`)
    .eq("active", true);

  const commissionersSorted = (commissioners as CommissionerRow[] ?? [])
    .slice()
    .sort((a, b) => districtOrder(a.district) - districtOrder(b.district));

  // Year list for filter pills — extract distinct years from existing meetings.
  const { data: yearRows } = await supabase
    .from("meetings")
    .select("meeting_date")
    .not("civicclerk_event_id", "is", null);
  const years = [...new Set((yearRows ?? []).map((r) => r.meeting_date.slice(0, 4)))]
    .sort((a, b) => b.localeCompare(a));

  // Meeting query — filterable server-side.
  let query = supabase
    .from("meetings")
    .select(
      `id, meeting_date, meeting_type, agenda_url, minutes_url,
       agenda_items ( id, commission_votes ( id, vote ) )`,
      { count: "exact" },
    )
    .order("meeting_date", { ascending: false });

  if (year !== "all") {
    query = query.gte("meeting_date", `${year}-01-01`).lte("meeting_date", `${year}-12-31`);
  }
  if (meetingType !== "all") {
    query = query.eq("meeting_type", meetingType);
  }
  if (q) {
    // Match meetings whose agenda items contain the search term.
    // Supabase foreign filters use .or() on the joined table.
    const { data: itemMatches } = await supabase
      .from("agenda_items")
      .select("meeting_id")
      .ilike("title", `%${q}%`);
    const matchingMeetingIds = [...new Set((itemMatches ?? []).map((r) => r.meeting_id))];
    if (matchingMeetingIds.length === 0) {
      // No matches — short-circuit to empty result.
      return renderPage({
        commissioners: commissionersSorted, years,
        q, year, meetingType, voteShape, page,
        meetings: [], totalCount: 0,
      });
    }
    query = query.in("id", matchingMeetingIds);
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data: meetingsRaw, count } = await query.range(from, from + PAGE_SIZE - 1);

  let meetings = (meetingsRaw as unknown as MeetingRow[] ?? []);

  // Post-filter by vote shape (can't do this cleanly in SQL without a derived column).
  if (voteShape !== "all") {
    meetings = meetings.filter((m) => {
      const allVotes = (m.agenda_items ?? []).flatMap((i) => i.commission_votes ?? []);
      const hasNo = allVotes.some((v) => v.vote === "no");
      if (voteShape === "contested") return hasNo;
      if (voteShape === "unanimous") return allVotes.length > 0 && !hasNo;
      return true;
    });
  }

  return renderPage({
    commissioners: commissionersSorted, years,
    q, year, meetingType, voteShape, page,
    meetings, totalCount: count ?? 0,
  });
}

function renderPage(props: {
  commissioners: CommissionerRow[];
  years: string[];
  q: string; year: string; meetingType: string; voteShape: string; page: number;
  meetings: MeetingRow[]; totalCount: number;
}) {
  const { commissioners, years, q, year, meetingType, voteShape, page, meetings, totalCount } = props;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
            Every commission meeting, every recorded vote, synced weekly from{" "}
            <a href="https://maconbibbcoga.portal.civicclerk.com" target="_blank" rel="noopener" style={{ color: "var(--peach)", fontWeight: 600 }}>
              CivicClerk
            </a>.
          </p>
        </header>

        {/* Commissioner grid */}
        <section style={{ marginBottom: 56 }}>
          <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderTop: "1.5px solid var(--border)", paddingTop: 12, marginBottom: 16 }}>
            Your Commissioners
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1.5px", background: "var(--border)", border: "1.5px solid var(--border)" }}>
            {commissioners.map((c) => {
              const total = c.commission_votes?.length ?? 0;
              const yes = c.commission_votes?.filter((v) => v.vote === "yes").length ?? 0;
              const pct = total > 0 ? Math.round((yes / total) * 100) : null;
              return (
                <Link
                  key={c.id}
                  href={`/commission/${c.id}`}
                  style={{ background: "var(--card)", padding: "20px 16px", textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}
                >
                  <Avatar name={c.name} src={c.image_url} />
                  <div>
                    <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", marginBottom: 2 }}>
                      {c.district}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)", letterSpacing: "-0.01em" }}>
                      {c.name}
                    </div>
                    {pct !== null && (
                      <div style={{ fontSize: "var(--micro)", color: "var(--text-light)", marginTop: 4, fontWeight: 500 }}>
                        {pct}% yes · {total} votes
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Filter bar — separate forms per filter, so clicking a pill does its own GET.
            This is the simplest reliable way to make pill filters "just work" without
            any client JS while keeping a server-rendered page. */}
        <section style={{ marginBottom: 32 }}>
          {/* Search is its own form — press Enter or click Search to submit */}
          <form method="GET" action="/commission" style={{ marginBottom: 14 }}>
            {/* Preserve other filters across search submissions */}
            {year !== "all" && <input type="hidden" name="year" value={year} />}
            {meetingType !== "all" && <input type="hidden" name="type" value={meetingType} />}
            {voteShape !== "all" && <input type="hidden" name="votes" value={voteShape} />}
            <div style={{ display: "flex", gap: 0 }}>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search agenda items — e.g. budget, zoning, police..."
                style={{ flex: 1, padding: "14px 18px", fontSize: "var(--body)", border: "1.5px solid var(--border)", background: "var(--card)", fontFamily: "inherit", borderRight: "none" }}
              />
              <button type="submit" style={{ padding: "10px 24px", fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", background: "var(--text)", color: "var(--card)", border: "1.5px solid var(--text)", cursor: "pointer" }}>
                Search
              </button>
            </div>
          </form>

          {/* Filter pills — each pill is its own link that rebuilds the URL with
              that filter changed and everything else preserved. Clicking a pill
              navigates immediately. */}
          <FilterPills label="Year" paramKey="year" current={year}
            options={[["all", "All years"], ...years.map((y) => [y, y] as [string, string])]}
            state={{ q, year, meetingType, voteShape }} />
          <FilterPills label="Type" paramKey="type" current={meetingType}
            options={[
              ["all", "All"], ["regular", "Commission"], ["work_session", "Pre-Commission"],
              ["special", "Special Called"], ["committee", "Committee"],
            ]}
            state={{ q, year, meetingType, voteShape }} />
          <FilterPills label="Votes" paramKey="votes" current={voteShape}
            options={[
              ["all", "All"], ["contested", "Contested (any No)"], ["unanimous", "Unanimous"],
            ]}
            state={{ q, year, meetingType, voteShape }} />

          {(q || year !== "all" || meetingType !== "all" || voteShape !== "all") && (
            <div style={{ marginTop: 14 }}>
              <Link href="/commission" style={{ padding: "8px 18px", fontSize: "var(--micro)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", background: "var(--card)", color: "var(--text)", border: "1.5px solid var(--border)", textDecoration: "none" }}>
                Reset filters
              </Link>
            </div>
          )}
        </section>

        {/* Meeting list — summary cards */}
        <section>
          <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderTop: "1.5px solid var(--border)", paddingTop: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span>Meetings {totalCount > 0 ? `(${totalCount.toLocaleString()})` : ""}</span>
            {totalPages > 1 && (
              <span style={{ fontSize: "var(--micro)", textTransform: "none", letterSpacing: 0, fontWeight: 500, color: "var(--text-light)" }}>
                Page {page} of {totalPages}
              </span>
            )}
          </div>

          {meetings.length === 0 && (
            <div style={{ padding: "40px 0", color: "var(--text-secondary)" }}>
              {q ? `No agenda items match "${q}" with these filters.` : "No meetings match these filters."}
            </div>
          )}

          <div style={{ background: "var(--border)", display: "grid", gap: "1.5px", border: "1.5px solid var(--border)" }}>
            {meetings.map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, gap: 12 }}>
              <PaginationLink
                disabled={page <= 1}
                href={pageHref({ q, year, meetingType, voteShape, page: page - 1 })}
                label="← Previous"
              />
              <span style={{ fontSize: "var(--micro)", color: "var(--text-secondary)", fontWeight: 500 }}>
                {(((page - 1) * PAGE_SIZE) + 1)}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
              </span>
              <PaginationLink
                disabled={page >= totalPages}
                href={pageHref({ q, year, meetingType, voteShape, page: page + 1 })}
                label="Next →"
              />
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

type FilterState = { q: string; year: string; meetingType: string; voteShape: string };

function FilterPills({ label, paramKey, current, options, state }: {
  label: string; paramKey: "year" | "type" | "votes"; current: string;
  options: [string, string][]; state: FilterState;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
      <span style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", minWidth: 60 }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(([val, lab]) => {
          const active = val === current;
          const href = buildFilterHref(state, paramKey, val);
          return (
            <Link
              key={val}
              href={href}
              prefetch={false}
              style={{
                padding: "6px 14px",
                fontSize: "var(--micro)",
                fontWeight: 600,
                border: `1.5px solid ${active ? "var(--text)" : "var(--border)"}`,
                background: active ? "var(--text)" : "var(--card)",
                color: active ? "var(--card)" : "var(--text)",
                textDecoration: "none",
                userSelect: "none",
              }}
            >
              {lab}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Build a /commission URL with one filter param updated and page reset to 1.
function buildFilterHref(state: FilterState, key: "year" | "type" | "votes", value: string): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  // Preserve the other two filters
  if (key !== "year" && state.year !== "all") sp.set("year", state.year);
  if (key !== "type" && state.meetingType !== "all") sp.set("type", state.meetingType);
  if (key !== "votes" && state.voteShape !== "all") sp.set("votes", state.voteShape);
  // Set the changed filter (skip if it's "all" — default)
  if (value !== "all") sp.set(key, value);
  const qs = sp.toString();
  return qs ? `/commission?${qs}` : "/commission";
}

function MeetingCard({ meeting: m }: { meeting: MeetingRow }) {
  const items = m.agenda_items ?? [];
  // "Motions" = items that actually had a recorded vote. One agenda item can
  // have many vote records (one per commissioner who voted), so summing
  // commission_votes.length overcounts by ~9x. Items-with-votes is the number
  // a voter actually cares about.
  const motionsWithVote = items.filter((i) => (i.commission_votes?.length ?? 0) > 0).length;
  const contestedCount = items.filter((i) => (i.commission_votes ?? []).some((v) => v.vote === "no")).length;
  const label = meetingLabel(m.meeting_type);
  const dateStr = formatDate(m.meeting_date);
  const isFuture = m.meeting_date > new Date().toISOString().slice(0, 10);
  const isSynced = m.minutes_url === "synced";

  return (
    <Link
      href={`/commission/meeting/${m.id}`}
      style={{ background: "var(--card)", padding: "18px 24px", textDecoration: "none", color: "var(--text)", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}
    >
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.015em" }}>
          {dateStr}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {isFuture && <Tag text="Upcoming" color="var(--peach)" />}
        {!isFuture && !isSynced && <Tag text="Pending" color="var(--text-light)" />}
        {items.length > 0 && <Tag text={`${items.length} ${items.length === 1 ? "item" : "items"}`} />}
        {motionsWithVote > 0 && (
          <Tag
            text={`${motionsWithVote} ${motionsWithVote === 1 ? "vote" : "votes"}`}
            color={contestedCount > 0 ? "#DC2626" : "var(--green)"}
          />
        )}
        <span style={{ color: "var(--text-light)", fontSize: "1.2rem" }}>→</span>
      </div>
    </Link>
  );
}

function Tag({ text, color = "var(--text-secondary)" }: { text: string; color?: string }) {
  return (
    <span style={{ fontSize: "var(--micro)", fontWeight: 700, padding: "3px 10px", border: `1.5px solid ${color}`, color, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

function PaginationLink({ disabled, href, label }: { disabled: boolean; href: string; label: string }) {
  if (disabled) {
    return (
      <span style={{ padding: "10px 20px", fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-light)", border: "1.5px solid var(--border)", background: "var(--card)" }}>
        {label}
      </span>
    );
  }
  return (
    <Link href={href} style={{ padding: "10px 20px", fontSize: "var(--kicker)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text)", border: "1.5px solid var(--text)", background: "var(--card)", textDecoration: "none" }}>
      {label}
    </Link>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  const initials = name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("");
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }} />;
  }
  return (
    <div style={{
      width: 64, height: 64, borderRadius: "50%", background: "var(--peach-bg, #FFE8D6)",
      border: "2px solid var(--peach)", color: "var(--peach)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 900, fontSize: "1.15rem", letterSpacing: "0.02em",
    }}>
      {initials}
    </div>
  );
}

function pageHref({ q, year, meetingType, voteShape, page }: {
  q: string; year: string; meetingType: string; voteShape: string; page: number;
}) {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (year !== "all") sp.set("year", year);
  if (meetingType !== "all") sp.set("type", meetingType);
  if (voteShape !== "all") sp.set("votes", voteShape);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/commission?${qs}` : "/commission";
}

// Parse "District 5" → 5, "Mayor" → 99 so the mayor sits at the end.
function districtOrder(district: string): number {
  if (!district) return 98;
  const m = district.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 99;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
}

function meetingLabel(type: string) {
  if (type === "regular") return "Commission Meeting";
  if (type === "work_session") return "Pre-Commission / Work Session";
  if (type === "special") return "Special Called Meeting";
  if (type === "committee") return "Committee Meeting";
  return type;
}

type VoteStub = { id: string; vote: string };
type AgendaItemStub = { id: string; commission_votes: VoteStub[] };
type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_type: string;
  agenda_url: string | null;
  minutes_url: string | null;
  agenda_items: AgendaItemStub[];
};
type CommissionerRow = {
  id: string; name: string; district: string; image_url: string | null;
  commission_votes: VoteStub[];
};

export const dynamic = "force-dynamic";
