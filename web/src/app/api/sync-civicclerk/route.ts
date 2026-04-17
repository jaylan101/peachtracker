// CivicClerk sync — two-phase approach to avoid Vercel function timeout:
//
// POST ?phase=meetings  — fetches all Events pages, upserts meeting rows only (~5s)
// POST ?phase=items&id=<meeting_id>  — fetches one meeting's detail + upserts items/votes (~2s)
// POST (no phase)  — runs phase=meetings then items for the first unsynced meeting
//
// GET ?debug=1  — shows raw event counts without DB writes

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Give Vercel enough time to walk paginated CivicClerk responses.
// The server caps page size at ~15 regardless of $top, so covering 3 years
// of commission meetings (~150 events) means ~10 page fetches minimum.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CIVICCLERK_BASE = "https://maconbibbcoga.api.civicclerk.com/v1";
const COMMISSION_CATEGORIES = ["Board of Commissioners"];

function toMeetingType(eventName: string): string {
  const lower = eventName.toLowerCase();
  if (lower.includes("pre-commission") || lower.includes("pre commission")) return "work_session";
  if (lower.includes("special") || lower.includes("called")) return "special";
  if (lower.includes("committee")) return "committee";
  if (lower.includes("public hearing")) return "special";
  return "regular";
}

// Fetch commission events from CivicClerk, newest first, following pagination.
//
// Why this is shaped the way it is:
//   - The old approach fetched /Events with no filter or order. CivicClerk
//     returns events in creation (id) order, which is roughly oldest-first,
//     and the server caps each page at ~15 items regardless of $top. That
//     meant the first hundred events were all early 2023 test meetings,
//     and the sync ran out of time (or hit an undocumented page limit)
//     before reaching anything from 2025 or 2026.
//   - Now we push the filter onto the server: only commission meetings that
//     have a real agendaId, ordered by startDateTime descending. That way
//     the very first page already contains the newest meetings we care
//     about, and a "stopAt" cutoff lets the sync short-circuit once it
//     reaches dates we already have in the DB.
//
// Passing `stopAtDate` (a YYYY-MM-DD string — the newest meeting_date we
// already have in Supabase) makes this an incremental sync: we stop walking
// pages once the current page's oldest event is older than the cutoff. Omit
// it to pull everything.
async function fetchCommissionEvents(opts?: { stopAtDate?: string; maxPages?: number }): Promise<{ events: CivicEvent[]; pagesFetched: number; stoppedEarly: boolean }> {
  const { stopAtDate, maxPages = 80 } = opts ?? {};
  const all: CivicEvent[] = [];

  // OData: filter to the commission category + has-agenda, ordered newest first.
  // We don't rely on $top because the server caps it; we just follow nextLink.
  const filter = `categoryName eq 'Board of Commissioners' and agendaId gt 0`;
  const firstUrl = `${CIVICCLERK_BASE}/Events?$orderby=startDateTime desc&$filter=${encodeURIComponent(filter)}`;

  let nextUrl: string | null = firstUrl;
  let pagesFetched = 0;
  let stoppedEarly = false;

  while (nextUrl && pagesFetched < maxPages) {
    const r: Response = await fetch(nextUrl, { headers: { Accept: "application/json" } });
    if (!r.ok) break;
    const d: { value?: CivicEvent[]; "@odata.nextLink"?: string } = await r.json();
    const page = d.value ?? [];
    all.push(...page);
    pagesFetched++;

    // Incremental stop: if the oldest event on this page is already older than
    // what we have in the DB, we've pulled everything new and can bail.
    if (stopAtDate && page.length > 0) {
      const oldestOnPage = page[page.length - 1].startDateTime.slice(0, 10);
      if (oldestOnPage < stopAtDate) {
        stoppedEarly = true;
        break;
      }
    }

    nextUrl = d["@odata.nextLink"] ?? null;
  }

  return { events: all, pagesFetched, stoppedEarly };
}

// Legacy unfiltered fetch kept for the debug endpoint so we can still see
// raw category counts and pagination behavior without the new filter.
async function fetchAllEvents(): Promise<CivicEvent[]> {
  const all: CivicEvent[] = [];
  let nextUrl: string | null = `${CIVICCLERK_BASE}/Events?$top=100`;
  let page = 0;
  while (nextUrl && page < 40) {
    const r: Response = await fetch(nextUrl, { headers: { Accept: "application/json" } });
    if (!r.ok) break;
    const d: { value?: CivicEvent[]; "@odata.nextLink"?: string } = await r.json();
    all.push(...(d.value ?? []));
    nextUrl = d["@odata.nextLink"] ?? null;
    page++;
  }
  return all;
}

// GET: debug — shows what the sync would pull without touching the DB.
// ?debug=1       — uses the new filtered/ordered query (what the sync uses)
// ?debug=raw     — uses the old bare /Events query (useful for diagnosing
//                  pagination behavior or discovering new categories)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug");
  if (!debug) {
    return NextResponse.json({ error: "Add ?debug=1 or ?debug=raw" }, { status: 400 });
  }

  if (debug === "raw") {
    const events = await fetchAllEvents();
    const commission = events.filter(
      (e) => COMMISSION_CATEGORIES.includes(e.categoryName) && e.hasAgenda,
    );
    return NextResponse.json({
      mode: "raw",
      total: events.length,
      commissionWithAgenda: commission.length,
      sample: commission.slice(0, 5).map((e) => ({
        id: e.id, eventName: e.eventName, date: e.startDateTime,
        agendaId: e.agendaId, category: e.categoryName,
      })),
      allCategories: [...new Set(events.map((e) => e.categoryName))].sort(),
    });
  }

  const { events, pagesFetched } = await fetchCommissionEvents();
  const yearCounts: Record<string, number> = {};
  for (const e of events) {
    const y = e.startDateTime.slice(0, 4);
    yearCounts[y] = (yearCounts[y] ?? 0) + 1;
  }
  return NextResponse.json({
    mode: "filtered",
    pagesFetched,
    totalCommissionEvents: events.length,
    yearCounts,
    newest5: events.slice(0, 5).map((e) => ({
      id: e.id, eventName: e.eventName, date: e.startDateTime,
      agendaId: e.agendaId, published: e.isPublished,
    })),
    oldest3: events.slice(-3).map((e) => ({
      id: e.id, eventName: e.eventName, date: e.startDateTime, agendaId: e.agendaId,
    })),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const phase = searchParams.get("phase") ?? "meetings";
  const targetMeetingId = searchParams.get("id"); // Supabase meeting UUID for items phase

  // ── PHASE: sync-by-agendaid ───────────────────────────────────────────────
  // Fetch a specific CivicClerk agenda by its numeric ID (not Supabase UUID).
  // Useful for meetings that exist in Meetings API but aren't exposed via Events.
  if (phase === "sync-by-agendaid") {
    const agendaId = parseInt(searchParams.get("agendaid") ?? "", 10);
    if (!agendaId) return NextResponse.json({ error: "Missing agendaid" }, { status: 400 });

    // Load commissioners
    const { data: commRows } = await supabase
      .from("commissioners").select("id, name").eq("active", true);
    const commMap = new Map<string, string>(
      (commRows ?? []).map((c) => [c.name.toLowerCase(), c.id]),
    );

    const r: Response = await fetch(`${CIVICCLERK_BASE}/Meetings/${agendaId}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return NextResponse.json({ error: `Meetings/${agendaId} returned ${r.status}` }, { status: 502 });
    const detail: CivicMeetingDetail = await r.json();
    const allItems = collectItems(detail);

    if (allItems.length === 0) {
      return NextResponse.json({ ok: true, agendaId, itemsSynced: 0, votesSynced: 0, message: "No items in this meeting" });
    }

    // Create or update the meeting row. We don't know the exact date from this
    // endpoint, but the date+type unique constraint requires unique values.
    // Use the agendaId to make a unique placeholder date (overridden when
    // the auto-sync eventually picks this up via Events).
    // Format: 2025-MM-DD where MM/DD encode the agendaId modulo to stay valid.
    const placeholderMonth = String((agendaId % 12) + 1).padStart(2, "0");
    const placeholderDay = String((agendaId % 28) + 1).padStart(2, "0");
    const placeholderDate = `2025-${placeholderMonth}-${placeholderDay}`;

    await supabase.from("meetings").upsert(
      { civicclerk_agenda_id: agendaId,
        meeting_date: placeholderDate,
        meeting_type: "regular",
        agenda_url: `https://maconbibbcoga.portal.civicclerk.com/` },
      { onConflict: "civicclerk_agenda_id" },
    );
    const { data: meeting } = await supabase
      .from("meetings").select("id").eq("civicclerk_agenda_id", agendaId).maybeSingle();
    if (!meeting) return NextResponse.json({ error: "Failed to upsert meeting row" }, { status: 500 });

    let itemsSynced = 0, votesSynced = 0;
    for (const item of allItems) {
      const rawName = item.agendaObjectItemName?.trim() ?? "";
      const name = rawName.replace(/<[^>]*>/g, "").trim();
      if (!name) continue;
      if (["call to order", "prayer", "pledge"].some((s) => name.toLowerCase().startsWith(s))) continue;

      const { data: itemRow } = await supabase.from("agenda_items")
        .upsert({ meeting_id: meeting.id, item_number: item.sortOrder ?? 0, title: name,
          full_text: item.agendaObjectItemDescription ?? null },
          { onConflict: "meeting_id,item_number" })
        .select("id").maybeSingle();
      if (!itemRow) continue;
      itemsSynced++;

      for (const vote of item.minutesItemVotes ?? []) {
        const allVoters = [
          ...(vote.yesVotes ?? []).map((n) => ({ name: n, vote: "yes" as const })),
          ...(vote.noVotes ?? []).map((n) => ({ name: n, vote: "no" as const })),
          ...(vote.abstainVotes ?? []).map((n) => ({ name: n, vote: "abstain" as const })),
        ];
        for (const v of allVoters) {
          const commId = commMap.get(v.name.toLowerCase()) ??
            [...commMap.entries()].find(([k]) => k.split(" ").pop() === v.name.toLowerCase().split(" ").pop())?.[1];
          if (!commId) continue;
          const { error } = await supabase.from("commission_votes").upsert(
            { agenda_item_id: itemRow.id, commissioner_id: commId, vote: v.vote, notes: vote.motionName ?? null },
            { onConflict: "agenda_item_id,commissioner_id" },
          );
          if (!error) votesSynced++;
        }
      }
    }
    return NextResponse.json({ ok: true, agendaId, meetingId: meeting.id, itemsSynced, votesSynced });
  }

  // ── PHASE: all-meeting-ids ───────────────────────────────────────────────────
  // Returns all meeting IDs in the DB so the client can run phase 2 on meetings
  // that weren't returned by the Events API (e.g. manually-inserted rows).
  if (phase === "all-meeting-ids") {
    const { data: rows } = await supabase
      .from("meetings")
      .select("id")
      .order("meeting_date", { ascending: false });
    return NextResponse.json({ meetingIds: (rows ?? []).map((r) => r.id) });
  }

  // ── PHASE: items ─────────────────────────────────────────────────────────────
  // Fetch agenda items + votes for one meeting. Called per-meeting from the UI.
  if (phase === "items" && targetMeetingId) {
    // Load commissioners
    const { data: commRows } = await supabase
      .from("commissioners").select("id, name").eq("active", true);
    const commMap = new Map<string, string>(
      (commRows ?? []).map((c) => [c.name.toLowerCase(), c.id]),
    );

    // Get civicclerk_agenda_id for this meeting
    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, civicclerk_agenda_id")
      .eq("id", targetMeetingId)
      .maybeSingle();

    if (!meeting?.civicclerk_agenda_id) {
      return NextResponse.json({ error: "Meeting not found or no agenda ID" }, { status: 404 });
    }

    const r: Response = await fetch(
      `${CIVICCLERK_BASE}/Meetings/${meeting.civicclerk_agenda_id}`,
      { headers: { Accept: "application/json" } },
    );
    if (!r.ok) {
      return NextResponse.json({ error: `Meetings fetch failed: ${r.status}` }, { status: 502 });
    }
    const detail: CivicMeetingDetail = await r.json();
    const allItems = collectItems(detail);

    let itemsSynced = 0;
    let votesSynced = 0;

    for (const item of allItems) {
      // Strip HTML tags that CivicClerk embeds in item names
      const rawName = item.agendaObjectItemName?.trim() ?? "";
      const name = rawName.replace(/<[^>]*>/g, "").trim();
      if (!name) continue;
      if (["call to order", "prayer", "pledge of allegiance"].some((s) =>
        name.toLowerCase().startsWith(s))) continue;

      const { data: itemRow } = await supabase
        .from("agenda_items")
        .upsert({
          meeting_id: meeting.id,
          item_number: item.sortOrder ?? 0,
          title: name,
          full_text: item.agendaObjectItemDescription ?? null,
        }, { onConflict: "meeting_id,item_number" })
        .select("id")
        .maybeSingle();

      if (!itemRow) continue;
      itemsSynced++;

      // Get votes: prefer GetMeetingItemMinutesVotes per item (more reliable than
      // embedded minutesItemVotes in Meetings/{id} which can be empty for recent meetings).
      // Falls back to embedded votes if the dedicated endpoint returns nothing.
      let voteSources: CivicMinuteVote[] = item.minutesItemVotes ?? [];
      if (item.id && voteSources.length === 0) {
        try {
          const vr: Response = await fetch(
            `${CIVICCLERK_BASE}/Meetings/GetMeetingItemMinutesVotes(id=${item.id})`,
            { headers: { Accept: "application/json" } },
          );
          if (vr.ok) {
            const vd: { value?: CivicMinuteVote[] } = await vr.json();
            voteSources = vd.value ?? [];
          }
        } catch { /* skip if endpoint errors */ }
      }

      for (const vote of voteSources) {
        const allVoters = [
          ...(vote.yesVotes ?? []).map((n) => ({ name: n, vote: "yes" as const })),
          ...(vote.noVotes ?? []).map((n) => ({ name: n, vote: "no" as const })),
          ...(vote.abstainVotes ?? []).map((n) => ({ name: n, vote: "abstain" as const })),
        ];
        for (const v of allVoters) {
          const commId = commMap.get(v.name.toLowerCase()) ??
            [...commMap.entries()].find(([k]) =>
              k.split(" ").pop() === v.name.toLowerCase().split(" ").pop()
            )?.[1];
          if (!commId) continue;
          const { error } = await supabase.from("commission_votes").upsert(
            { agenda_item_id: itemRow.id, commissioner_id: commId, vote: v.vote,
              notes: vote.motionName ?? null },
            { onConflict: "agenda_item_id,commissioner_id" },
          );
          if (!error) votesSynced++;
        }
      }
    }

    // Mark meeting as items-synced
    await supabase.from("meetings").update({ minutes_url: "synced" }).eq("id", meeting.id);

    return NextResponse.json({ ok: true, meetingId: meeting.id, itemsSynced, votesSynced });
  }

  // ── PHASE: meetings ───────────────────────────────────────────────────────────
  // Pull commission meeting rows from CivicClerk. Server-side filter + newest-
  // first ordering means we reach 2026 meetings on page 1 instead of having
  // to walk past three years of 2023 backlog.
  //
  // `full=1` on the query forces a complete refresh (no incremental stop).
  // Otherwise we stop once the current page is older than what's already in
  // the DB — which keeps a normal sync under a couple of seconds.
  const fullRefresh = searchParams.get("full") === "1";
  let stopAtDate: string | undefined;
  if (!fullRefresh) {
    const { data: newestRow } = await supabase
      .from("meetings")
      .select("meeting_date")
      .not("civicclerk_event_id", "is", null)
      .order("meeting_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    stopAtDate = newestRow?.meeting_date;
  }

  const { events, pagesFetched, stoppedEarly } = await fetchCommissionEvents({ stopAtDate });

  // Belt-and-suspenders: even though the server filter restricts the category,
  // keep the client-side check so a future API quirk can't silently widen
  // the set of rows we write.
  const commEvents = events.filter(
    (e) => COMMISSION_CATEGORIES.includes(e.categoryName) &&
      (e.hasAgenda || e.isPublished === "Published") &&
      e.agendaId,
  );

  let meetingsSynced = 0;
  const meetingIds: string[] = [];

  for (const event of commEvents) {
    const meetingDate = event.startDateTime.split("T")[0];
    const meetingType = toMeetingType(event.eventName);
    const agendaUrl = `https://maconbibbcoga.portal.civicclerk.com/event/${event.id}/files`;

    // Upsert then fetch separately — chained .select() after upsert is
    // unreliable when the row already exists (Supabase returns null on conflict).
    await supabase
      .from("meetings")
      .upsert({
        civicclerk_event_id: event.id,
        civicclerk_agenda_id: event.agendaId,
        meeting_date: meetingDate,
        meeting_type: meetingType,
        agenda_url: agendaUrl,
      }, { onConflict: "civicclerk_event_id" });

    const { data: row } = await supabase
      .from("meetings")
      .select("id")
      .eq("civicclerk_event_id", event.id)
      .maybeSingle();

    if (row) {
      meetingsSynced++;
      meetingIds.push(row.id);
    }
  }

  return NextResponse.json({
    ok: true,
    meetingsSynced,
    meetingIds, // caller can use these to trigger items phase per-meeting
    pagesFetched,
    stoppedEarly,
    stopAtDate,
    mode: fullRefresh ? "full" : "incremental",
    message: `${meetingsSynced} meetings synced from ${pagesFetched} API pages. Now call POST ?phase=items&id=<meeting_id> for each to pull agenda items + votes.`,
  });
}

function collectItems(detail: CivicMeetingDetail): CivicAgendaItem[] {
  const items: CivicAgendaItem[] = [];
  function walk(list: CivicAgendaItem[] | undefined) {
    if (!list) return;
    for (const item of list) {
      items.push(item);
      walk(item.childItems);
    }
  }
  walk(detail.items);
  return items;
}

interface CivicEvent {
  id: number; eventName: string; startDateTime: string;
  agendaId: number; categoryName: string; hasAgenda: boolean;
  isPublished?: string;
}
interface CivicMeetingDetail { items?: CivicAgendaItem[]; }
interface CivicAgendaItem {
  id?: number;                           // agenda item ID for GetMeetingItemMinutesVotes
  agendaObjectItemName?: string; agendaObjectItemNumber?: string | number;
  agendaObjectItemOutlineNumber?: string; agendaObjectItemDescription?: string;
  minutesItemVotes?: CivicMinuteVote[]; childItems?: CivicAgendaItem[]; sortOrder?: number;
}
interface CivicMinuteVote {
  motionName?: string; initiatedBy?: string; secondedBy?: string;
  passFail?: number | string; yesVotes?: string[]; noVotes?: string[]; abstainVotes?: string[];
}
