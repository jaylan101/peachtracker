// CivicClerk sync — fetches Board of Commissioners events + full meeting data
// (agenda items, vote records, commissioner names) from the public Macon-Bibb
// CivicClerk API and upserts everything into Supabase.
//
// ALL of this is available without a bearer token. The key insight:
//   - Events endpoint gives eventId + agendaId
//   - Meetings/{agendaId} returns the full agenda with items + votes
//
// Commissioner rows must exist in the `commissioners` table first.
// If a commissioner name isn't found, the vote is stored without linking.

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

function toVote(vote: string | null | undefined): "yes" | "no" | "abstain" | "absent" {
  if (!vote) return "absent";
  const v = vote.toLowerCase();
  if (v === "yes" || v === "aye") return "yes";
  if (v === "no" || v === "nay") return "no";
  if (v === "abstain") return "abstain";
  return "absent";
}

// GET: debug endpoint — returns raw CivicClerk events without touching DB
// Only in non-production or when a debug param is passed
export async function GET(request: Request) {
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug");
  if (!debug) return NextResponse.json({ error: "Add ?debug=1" }, { status: 400 });

  const res = await fetch(`${CIVICCLERK_BASE}/Events?$orderby=startDateTime desc&$top=200`, {
    headers: { Accept: "application/json" },
  });
  const json = await res.json();
  const events: CivicEvent[] = json.value ?? [];
  const commission = events.filter(
    (e) => COMMISSION_CATEGORIES.includes(e.categoryName) && e.hasAgenda,
  );
  return NextResponse.json({
    total: events.length,
    commissionWithAgenda: commission.length,
    sample: commission.slice(0, 5).map((e) => ({
      id: e.id, eventName: e.eventName, date: e.startDateTime, agendaId: e.agendaId, category: e.categoryName,
    })),
    allCategories: [...new Set(events.map((e) => e.categoryName))].sort(),
  });
}

export async function POST() {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Load existing commissioners into a name→id map
  const { data: commissionerRows } = await supabase
    .from("commissioners")
    .select("id, name")
    .eq("active", true);
  const commissionerMap = new Map<string, string>(
    (commissionerRows ?? []).map((c) => [c.name.toLowerCase(), c.id]),
  );

  // Fetch all events from CivicClerk — no $filter (OData filters cause 500s).
  // We filter client-side by category and hasAgenda.
  console.log("[sync] fetching CivicClerk Events...");
  const eventsRes = await fetch(
    `${CIVICCLERK_BASE}/Events?$orderby=startDateTime desc&$top=200`,
    { headers: { Accept: "application/json" } },
  );
  console.log(`[sync] Events response: ${eventsRes.status}`);
  if (!eventsRes.ok) {
    const text = await eventsRes.text();
    console.error(`[sync] Events error body: ${text.slice(0, 200)}`);
    return NextResponse.json({ error: `Events fetch failed: ${eventsRes.status}` }, { status: 502 });
  }
  const eventsJson = await eventsRes.json();
  const allEvents: CivicEvent[] = eventsJson.value ?? [];
  console.log(`[sync] total events returned: ${allEvents.length}`);
  // Filter client-side: commission category + has an agenda
  const commEvents = allEvents.filter(
    (e) => COMMISSION_CATEGORIES.includes(e.categoryName) && e.hasAgenda && e.agendaId,
  );
  console.log(`[sync] commission events with agenda: ${commEvents.length}`, commEvents.map(e => `${e.eventName} (${e.startDateTime.slice(0,10)}, agendaId=${e.agendaId})`));

  let meetingsSynced = 0;
  let itemsSynced = 0;
  let votesSynced = 0;
  const errors: string[] = [];

  for (const event of commEvents) {
    if (!event.agendaId) continue;

    // 1. Upsert the meeting row
    const meetingDate = event.startDateTime.split("T")[0];
    const meetingType = toMeetingType(event.eventName);
    const agendaUrl = `https://maconbibbcoga.portal.civicclerk.com/event/${event.id}/files`;

    const { data: meetingRow, error: meetingErr } = await supabase
      .from("meetings")
      .upsert(
        {
          civicclerk_event_id: event.id,
          civicclerk_agenda_id: event.agendaId,
          meeting_date: meetingDate,
          meeting_type: meetingType,
          agenda_url: agendaUrl,
        },
        { onConflict: "civicclerk_event_id" },
      )
      .select("id")
      .maybeSingle();

    if (meetingErr) {
      errors.push(`Meeting ${event.eventName}: ${meetingErr.message}`);
      continue;
    }
    if (!meetingRow) continue;
    meetingsSynced++;

    // 2. Fetch full meeting detail (agenda items + votes) — no auth needed
    let meetingDetail: CivicMeetingDetail | null = null;
    try {
      const detailRes = await fetch(`${CIVICCLERK_BASE}/Meetings/${event.agendaId}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      });
      if (detailRes.ok) {
        meetingDetail = await detailRes.json();
      }
    } catch {
      // Meeting detail unavailable — skip agenda items for this meeting
    }
    if (!meetingDetail) continue;

    // Collect all agenda items (top-level sections have children)
    const allItems = collectItems(meetingDetail);

    // 3. Upsert agenda items
    for (const item of allItems) {
      if (!item.agendaObjectItemName?.trim()) continue;

      // Skip purely structural items (Call to Order, Prayer, etc.)
      const name = item.agendaObjectItemName.trim();
      if (["call to order", "prayer", "pledge of allegiance"].some((s) =>
        name.toLowerCase().startsWith(s),
      )) continue;

      // Use sortOrder as item_number for stable upsert deduplication
      const itemNum = item.sortOrder ?? 0;

      const { data: itemRow, error: itemErr } = await supabase
        .from("agenda_items")
        .upsert(
          {
            meeting_id: meetingRow.id,
            item_number: itemNum,
            title: name,
            full_text: item.agendaObjectItemDescription ?? null,
            // summary_eli5 left null — to be filled manually or via AI later
          },
          { onConflict: "meeting_id,item_number" },
        )
        .select("id")
        .maybeSingle();

      if (itemErr) {
        errors.push(`Item "${name.slice(0, 40)}": ${itemErr.message}`);
        continue;
      }
      if (!itemRow) continue;
      itemsSynced++;

      // 4. Upsert votes for this item
      const votes = item.minutesItemVotes ?? [];
      for (const vote of votes) {
        const allVoters = [
          ...(vote.yesVotes ?? []).map((n) => ({ name: n, vote: "yes" as const })),
          ...(vote.noVotes ?? []).map((n) => ({ name: n, vote: "no" as const })),
          ...(vote.abstainVotes ?? []).map((n) => ({ name: n, vote: "abstain" as const })),
        ];

        for (const v of allVoters) {
          // Try to match commissioner by name (case-insensitive)
          const commId = commissionerMap.get(v.name.toLowerCase()) ??
            // Try last name match
            [...commissionerMap.entries()].find(([k]) =>
              k.split(" ").pop() === v.name.toLowerCase().split(" ").pop(),
            )?.[1];

          if (!commId) continue; // Skip unmatched names

          const { error: voteErr } = await supabase
            .from("commission_votes")
            .upsert(
              {
                agenda_item_id: itemRow.id,
                commissioner_id: commId,
                vote: v.vote,
                notes: vote.motionName ?? null,
              },
              { onConflict: "agenda_item_id,commissioner_id" },
            );

          if (!voteErr) votesSynced++;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    meetingsSynced,
    itemsSynced,
    votesSynced,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// Flatten the nested item/childItems tree into a single list
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

// ---- Types (verified against live API response) ----

interface CivicEvent {
  id: number;
  eventName: string;
  startDateTime: string;
  agendaId: number;
  categoryName: string;
  hasAgenda: boolean;
}

interface CivicMeetingDetail {
  items?: CivicAgendaItem[]; // top-level field is "items" not "agendaItems"
}

interface CivicAgendaItem {
  agendaObjectItemName?: string;
  agendaObjectItemNumber?: string | number; // sometimes a string like "2026-241"
  agendaObjectItemOutlineNumber?: string;   // display position e.g. "1.", "a."
  agendaObjectItemDescription?: string;
  minutesItemVotes?: CivicMinuteVote[];     // "minutesItemVotes" not "minuteVotes"
  childItems?: CivicAgendaItem[];           // "childItems" not "children"
  sortOrder?: number;
}

interface CivicMinuteVote {
  motionName?: string;
  initiatedBy?: string;
  secondedBy?: string;
  passFail?: number | string; // 1 = pass
  yesVotes?: string[];        // array of commissioner name strings
  noVotes?: string[];
  abstainVotes?: string[];
  // absent commissioners don't get a record — they're simply not listed
}
