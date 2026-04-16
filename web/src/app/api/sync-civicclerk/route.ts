// CivicClerk sync — two-phase approach to avoid Vercel function timeout:
//
// POST ?phase=meetings  — fetches all Events pages, upserts meeting rows only (~5s)
// POST ?phase=items&id=<meeting_id>  — fetches one meeting's detail + upserts items/votes (~2s)
// POST (no phase)  — runs phase=meetings then items for the first unsynced meeting
//
// GET ?debug=1  — shows raw event counts without DB writes

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

// Fetch all CivicClerk Events following pagination
async function fetchAllEvents(): Promise<CivicEvent[]> {
  const all: CivicEvent[] = [];
  let nextUrl: string | null = `${CIVICCLERK_BASE}/Events?$top=100`;
  let page = 0;
  while (nextUrl && page < 150) { // 150 pages × 100 = up to 15,000 events covers full history
    const r: Response = await fetch(nextUrl, { headers: { Accept: "application/json" } });
    if (!r.ok) break;
    const d: { value?: CivicEvent[]; "@odata.nextLink"?: string } = await r.json();
    all.push(...(d.value ?? []));
    nextUrl = d["@odata.nextLink"] ?? null;
    page++;
  }
  return all;
}

// GET: debug — shows event counts without touching DB
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!searchParams.get("debug")) {
    return NextResponse.json({ error: "Add ?debug=1" }, { status: 400 });
  }
  const events = await fetchAllEvents();
  const commission = events.filter(
    (e) => COMMISSION_CATEGORIES.includes(e.categoryName) && e.hasAgenda,
  );
  return NextResponse.json({
    total: events.length,
    commissionWithAgenda: commission.length,
    sample: commission.slice(0, 5).map((e) => ({
      id: e.id, eventName: e.eventName, date: e.startDateTime,
      agendaId: e.agendaId, category: e.categoryName,
    })),
    allCategories: [...new Set(events.map((e) => e.categoryName))].sort(),
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
  // Fetch all CivicClerk Event pages, upsert meeting rows. Fast (~5s total).
  const allEvents = await fetchAllEvents();
  const commEvents = allEvents.filter(
    // Include published events even when hasAgenda=false — some 2025/2026 meetings
    // have minutes in the API but hasAgenda isn't set to true yet. The Meetings
    // endpoint works by agendaId regardless.
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
    message: `${meetingsSynced} meetings synced. Now call POST ?phase=items&id=<meeting_id> for each to pull agenda items + votes.`,
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
