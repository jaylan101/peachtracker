// CivicClerk sync — fetches Board of Commissioners events from the public
// Macon-Bibb CivicClerk API and upserts them into the Supabase `meetings` table.
//
// What this syncs (no auth needed):
//   - Meeting date, type, CivicClerk event ID, agenda URL when available
//
// What this can't sync without a bearer token from the city:
//   - Agenda items (titles, ELI5 summaries)
//   - Commissioner votes
//
// Run from /admin via the "Sync meetings from CivicClerk" button.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const CIVICCLERK_BASE = "https://maconbibbcoga.api.civicclerk.com/v1";

// Only sync these categories — skip pension boards, special districts, etc.
const COMMISSION_CATEGORIES = [
  "Board of Commissioners",
];

// Map CivicClerk event names to our meeting_type enum
function toMeetingType(eventName: string): string {
  const lower = eventName.toLowerCase();
  if (lower.includes("pre-commission") || lower.includes("pre commission")) return "work_session";
  if (lower.includes("special") || lower.includes("called")) return "special";
  if (lower.includes("committee")) return "committee";
  if (lower.includes("public hearing")) return "special";
  return "regular";
}

export async function POST() {
  // Verify caller is an authenticated admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: isAdminResult } = await supabase.rpc("is_admin");
  if (!isAdminResult) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch all events with agendas from CivicClerk (last 2 years + upcoming)
  const params = new URLSearchParams({
    "$orderby": "startDateTime desc",
    "$top": "100",
    "$filter": "hasAgenda eq true",
  });

  let civicEvents: CivicClerkEvent[] = [];
  try {
    const res = await fetch(`${CIVICCLERK_BASE}/Events?${params}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`CivicClerk returned ${res.status}`);
    const json = await res.json();
    civicEvents = (json.value ?? []) as CivicClerkEvent[];
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  // Filter to commission-related meetings only
  const commissionEvents = civicEvents.filter((e) =>
    COMMISSION_CATEGORIES.includes(e.categoryName),
  );

  // Upsert each into the meetings table.
  // We store the CivicClerk event ID in a text column so we can avoid dupes.
  // Since the schema doesn't have a civicclerk_id column yet we use a combination
  // of meeting_date + meeting_type as the uniqueness key for now.
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const event of commissionEvents) {
    const meetingDate = event.startDateTime.split("T")[0]; // YYYY-MM-DD
    const meetingType = toMeetingType(event.eventName);

    // Build the agenda URL if CivicClerk has one published
    const agendaUrl = event.agendaId
      ? `https://maconbibbcoga.portal.civicclerk.com/event/${event.id}/files`
      : null;

    const { error } = await supabase
      .from("meetings")
      .upsert(
        {
          civicclerk_event_id: event.id,
          civicclerk_agenda_id: event.agendaId || null,
          meeting_date: meetingDate,
          meeting_type: meetingType,
          agenda_url: agendaUrl,
        },
        { onConflict: "civicclerk_event_id", ignoreDuplicates: false },
      );

    if (error) {
      // Likely a conflict that couldn't be resolved — skip gracefully
      if (error.code === "23505" || error.message?.includes("conflict")) {
        skipped++;
      } else {
        errors.push(`${event.eventName} (${meetingDate}): ${error.message}`);
      }
    } else {
      synced++;
    }
  }

  return NextResponse.json({
    ok: true,
    total: commissionEvents.length,
    synced,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}

interface CivicClerkEvent {
  id: number;
  eventName: string;
  startDateTime: string;
  agendaId: number;
  categoryName: string;
  hasAgenda: boolean;
  hasMedia: boolean;
  eventLocation?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
  };
}
