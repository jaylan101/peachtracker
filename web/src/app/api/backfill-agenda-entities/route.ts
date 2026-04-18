// One-off backfill: decode HTML entities in agenda_items.title and full_text.
//
// CivicClerk sync historically stored "&amp;", "&nbsp;", "&#39;" etc. verbatim.
// As of commit [this deploy] the sync decodes them at ingest time, but ~273
// existing rows still carry the encoded strings. This route decodes them in
// place using the same cleanAgendaText helper the sync now uses.
//
// Admin-only. Runs in phases to stay under the Vercel 60s cap.
//
// Flow (client-driven, one HTTP call per phase):
//   GET  ?dry=1&field=title         — preview first 20 rows that would change
//   POST ?phase=title&start=0       — decode a batch of titles (BATCH=100)
//   POST ?phase=full_text&start=0   — decode a batch of full_text values
//
// Safe to run twice: cleanAgendaText is idempotent on already-decoded text
// (characters like "&" and "'" don't match the &...; entity pattern), and
// we skip rows where the decoded value equals the current value.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cleanAgendaText } from "@/lib/civicclerk/decode-entities";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH = 100;

type Field = "title" | "full_text";

function isField(v: string | null): v is Field {
  return v === "title" || v === "full_text";
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { supabase, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { supabase, error: null as null };
}

// GET ?dry=1&field=title|full_text
// Returns preview of rows that have a `&...;` entity in the named column.
export async function GET(request: Request) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const field = searchParams.get("field");
  if (!isField(field)) {
    return NextResponse.json({ error: "Pass ?field=title or ?field=full_text" }, { status: 400 });
  }

  // Count rows needing decode.
  const { count } = await supabase
    .from("agenda_items")
    .select("id", { count: "exact", head: true })
    .like(field, "%&%");

  // Sample first 20 for human review.
  const { data: sample } = await supabase
    .from("agenda_items")
    .select(`id, ${field}`)
    .like(field, "%&%")
    .limit(20);

  const preview = (sample ?? []).map((row: Record<string, unknown>) => {
    const before = row[field] as string | null;
    const after = cleanAgendaText(before);
    const changed = (before ?? "") !== after;
    return { id: row.id as string, before, after, changed };
  });

  return NextResponse.json({ field, candidateCount: count ?? 0, sample: preview });
}

// POST ?phase=title|full_text&start=N
// Processes up to BATCH rows with `&...;` in the named column, starting from offset N.
// Returns { field, start, processed, updated, skipped, next, done }.
export async function POST(request: Request) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const phase = searchParams.get("phase");
  if (!isField(phase)) {
    return NextResponse.json({ error: "Pass ?phase=title or ?phase=full_text" }, { status: 400 });
  }
  const start = Math.max(0, parseInt(searchParams.get("start") ?? "0", 10) || 0);

  const { data: rows, error: fetchErr } = await supabase
    .from("agenda_items")
    .select(`id, ${phase}`)
    .like(phase, "%&%")
    .order("id", { ascending: true })
    .range(start, start + BATCH - 1);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  let updated = 0;
  let skipped = 0;
  for (const row of rows ?? []) {
    const r = row as Record<string, unknown>;
    const before = r[phase] as string | null;
    const after = cleanAgendaText(before);
    if (!before || before === after) { skipped++; continue; }

    const { error: updErr } = await supabase
      .from("agenda_items")
      .update({ [phase]: after })
      .eq("id", r.id as string);
    if (updErr) {
      console.warn("[backfill-agenda-entities] update failed:", r.id, updErr.message);
      skipped++;
      continue;
    }
    updated++;
  }

  const processed = rows?.length ?? 0;
  const done = processed < BATCH;
  const next = done ? null : start + BATCH;

  return NextResponse.json({
    field: phase,
    start,
    processed,
    updated,
    skipped,
    next,
    done,
  });
}
