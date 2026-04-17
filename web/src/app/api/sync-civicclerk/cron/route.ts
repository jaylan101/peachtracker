// Vercel Cron entrypoint for the weekly commission sync.
//
// Runs every Monday at 06:00 UTC (≈ 2am Eastern). Pulls new meetings incrementally
// (the stopAtDate cutoff makes this fast), then kicks off the items phase for any
// newly-added meetings.
//
// Auth: Vercel Cron requests include a Bearer token matching the CRON_SECRET env
// var. We skip the normal admin-session check because there's no user session
// on a cron invocation.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CIVICCLERK_BASE = "https://maconbibbcoga.api.civicclerk.com/v1";

interface CivicEvent {
  id: number; eventName: string; startDateTime: string;
  agendaId: number; categoryName: string; hasAgenda: boolean;
  isPublished?: string;
}

function toMeetingType(eventName: string): string {
  const lower = eventName.toLowerCase();
  if (lower.includes("pre-commission") || lower.includes("pre commission")) return "work_session";
  if (lower.includes("special") || lower.includes("called")) return "special";
  if (lower.includes("committee")) return "committee";
  if (lower.includes("public hearing")) return "special";
  return "regular";
}

export async function GET(request: Request) {
  // Vercel Cron sends a Bearer token; reject everyone else.
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role so we can bypass RLS without a user session.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Find the newest meeting we already have so we can bail as soon as we catch up.
  const { data: newestRow } = await supabase
    .from("meetings")
    .select("meeting_date")
    .not("civicclerk_event_id", "is", null)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stopAtDate = newestRow?.meeting_date;

  // Fetch commission events from CivicClerk, newest first.
  const filter = `categoryName eq 'Board of Commissioners' and agendaId gt 0`;
  const firstUrl = `${CIVICCLERK_BASE}/Events?$orderby=startDateTime desc&$filter=${encodeURIComponent(filter)}`;
  const events: CivicEvent[] = [];
  let nextUrl: string | null = firstUrl;
  let pagesFetched = 0;

  while (nextUrl && pagesFetched < 10) {
    const r: Response = await fetch(nextUrl, { headers: { Accept: "application/json" } });
    if (!r.ok) break;
    const d: { value?: CivicEvent[]; "@odata.nextLink"?: string } = await r.json();
    const page = d.value ?? [];
    events.push(...page);
    pagesFetched++;
    if (stopAtDate && page.length > 0) {
      const oldestOnPage = page[page.length - 1].startDateTime.slice(0, 10);
      if (oldestOnPage < stopAtDate) break;
    }
    nextUrl = d["@odata.nextLink"] ?? null;
  }

  const commEvents = events.filter(
    (e) => e.categoryName === "Board of Commissioners" &&
      (e.hasAgenda || e.isPublished === "Published") && e.agendaId,
  );

  let meetingsSynced = 0;
  for (const event of commEvents) {
    const meetingDate = event.startDateTime.split("T")[0];
    await supabase.from("meetings").upsert({
      civicclerk_event_id: event.id,
      civicclerk_agenda_id: event.agendaId,
      meeting_date: meetingDate,
      meeting_type: toMeetingType(event.eventName),
      agenda_url: `https://maconbibbcoga.portal.civicclerk.com/event/${event.id}/files`,
    }, { onConflict: "civicclerk_event_id" });
    meetingsSynced++;
  }

  return NextResponse.json({
    ok: true,
    meetingsSynced,
    pagesFetched,
    stopAtDate,
    ranAt: new Date().toISOString(),
    note: "Weekly cron — meeting rows upserted. Agenda items + votes are pulled on-demand by the admin sync button.",
  });
}
