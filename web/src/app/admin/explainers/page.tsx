import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saveExplainer, regenerateExplainer, clearExplainer } from "./_actions";

// Admin UI for per-vote explainer summaries.
//
// Filters (via ?filter= query param):
//   - missing  (default): summary_eli5 IS NULL — the backfill worklist
//   - edited:             admin-tuned rows, for review
//   - all:                everything
//
// Pagination: ?page=N, 25 per page. Server-rendered — no client state. Inline
// edit is a regular <form action={saveExplainer}>, keeps the code simple and
// matches the rest of /admin.

const PAGE_SIZE = 25;

type Filter = "missing" | "edited" | "all";

function parseFilter(v: string | null): Filter {
  if (v === "edited" || v === "all") return v;
  return "missing";
}

interface Row {
  id: string;
  title: string;
  full_text: string | null;
  summary_eli5: string | null;
  summary_edited: boolean;
  item_number: number;
  meetings: { id: string; meeting_date: string; meeting_type: string } | null;
}

export default async function ExplainersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const filter = parseFilter(sp.filter ?? null);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim();

  const supabase = await createClient();

  // Build the base query. Supabase JS filters chain, so we apply them
  // conditionally. `count: "exact"` gives us the total for pagination.
  let query = supabase
    .from("agenda_items")
    .select(
      `
      id, title, full_text, summary_eli5, summary_edited, item_number,
      meetings ( id, meeting_date, meeting_type )
      `,
      { count: "exact" },
    );

  if (filter === "missing") query = query.is("summary_eli5", null);
  if (filter === "edited") query = query.eq("summary_edited", true);
  if (q) query = query.ilike("title", `%${q}%`);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: items, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = (items ?? []) as unknown as Row[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Counts for the filter tabs, so the admin sees at-a-glance how much
  // backfill remains. Two small count queries — no pagination overhead.
  const { count: missingCount } = await supabase
    .from("agenda_items")
    .select("id", { count: "exact", head: true })
    .is("summary_eli5", null);
  const { count: editedCount } = await supabase
    .from("agenda_items")
    .select("id", { count: "exact", head: true })
    .eq("summary_edited", true);
  const { count: allCount } = await supabase
    .from("agenda_items")
    .select("id", { count: "exact", head: true });

  function tabHref(f: Filter) {
    const params = new URLSearchParams();
    if (f !== "missing") params.set("filter", f);
    if (q) params.set("q", q);
    const s = params.toString();
    return s ? `/admin/explainers?${s}` : "/admin/explainers";
  }

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (filter !== "missing") params.set("filter", filter);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/explainers?${s}` : "/admin/explainers";
  }

  return (
    <main className="admin-shell">
      <h1 className="admin-h1">Per-vote explainers</h1>
      <p className="admin-sub">
        One-sentence plain-language summaries that appear under each agenda
        item on commissioner profiles. New items get summaries automatically
        from Gemini during sync. Edit below to override; edited rows are
        protected from regeneration.
      </p>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <Link
          href={tabHref("missing")}
          className={"admin-btn " + (filter === "missing" ? "" : "admin-btn-ghost")}
          prefetch={false}
        >
          Needs summary ({missingCount ?? 0})
        </Link>
        <Link
          href={tabHref("edited")}
          className={"admin-btn " + (filter === "edited" ? "" : "admin-btn-ghost")}
          prefetch={false}
        >
          Hand-edited ({editedCount ?? 0})
        </Link>
        <Link
          href={tabHref("all")}
          className={"admin-btn " + (filter === "all" ? "" : "admin-btn-ghost")}
          prefetch={false}
        >
          All ({allCount ?? 0})
        </Link>
      </div>

      {/* Search */}
      <form method="get" action="/admin/explainers" style={{ marginBottom: 24, display: "flex", gap: 8 }}>
        {filter !== "missing" && <input type="hidden" name="filter" value={filter} />}
        <input
          name="q"
          defaultValue={q}
          className="admin-input"
          placeholder="Search titles…"
          style={{ flex: 1, maxWidth: 400 }}
        />
        <button type="submit" className="admin-btn admin-btn-ghost">Search</button>
        {q && (
          <Link href={tabHref(filter)} className="admin-btn admin-btn-ghost" prefetch={false}>
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 && (
        <div className="admin-card">
          {filter === "missing"
            ? "Nothing to backfill — every agenda item has a summary."
            : "No agenda items match."}
        </div>
      )}

      {rows.map((row) => (
        <ExplainerRow key={row.id} row={row} />
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 20, alignItems: "center", flexWrap: "wrap" }}>
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="admin-btn admin-btn-ghost" prefetch={false}>
              ← Prev
            </Link>
          )}
          <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Page {page} of {totalPages} · {total} total
          </span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="admin-btn admin-btn-ghost" prefetch={false}>
              Next →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

function ExplainerRow({ row }: { row: Row }) {
  const meetingLabel = row.meetings
    ? `${formatMeetingType(row.meetings.meeting_type)} · ${row.meetings.meeting_date}`
    : "(no meeting)";

  return (
    <div className="admin-card" style={{ marginBottom: 12 }}>
      <div className="admin-card-h" style={{ alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="admin-card-title" style={{ wordBreak: "break-word" }}>
            <span style={{ color: "var(--text-light)", marginRight: 6 }}>{row.item_number}.</span>
            {row.title}
          </div>
          <div className="admin-card-meta">
            {meetingLabel}
            {row.summary_edited && (
              <span style={{ marginLeft: 8, color: "var(--peach, #E0956E)", fontWeight: 700 }}>
                · EDITED
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Show full_text when present so admin has context for editing. */}
      {row.full_text && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Full text
          </summary>
          <div
            style={{
              marginTop: 8,
              padding: 12,
              background: "var(--card)",
              fontSize: "0.85rem",
              whiteSpace: "pre-wrap",
              maxHeight: 300,
              overflowY: "auto",
              border: "1px solid var(--border)",
            }}
          >
            {row.full_text}
          </div>
        </details>
      )}

      {/* Inline edit form */}
      <form action={saveExplainer} style={{ marginTop: 12 }}>
        <input type="hidden" name="id" value={row.id} />
        <label className="admin-label" htmlFor={`s-${row.id}`}>
          Summary (one sentence, plain language)
        </label>
        <textarea
          id={`s-${row.id}`}
          name="summary"
          defaultValue={row.summary_eli5 ?? ""}
          rows={2}
          className="admin-input"
          style={{ width: "100%", fontFamily: "inherit", resize: "vertical" }}
          placeholder="e.g. Hires a contractor to repave Poplar Street."
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button type="submit" className="admin-btn">Save</button>
        </div>
      </form>

      {/* Regenerate + Clear as separate forms so Save doesn't trigger them. */}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {!row.summary_edited && (
          <form action={regenerateExplainer}>
            <input type="hidden" name="id" value={row.id} />
            <button type="submit" className="admin-btn admin-btn-ghost">
              Regenerate with Gemini
            </button>
          </form>
        )}
        {(row.summary_eli5 || row.summary_edited) && (
          <form action={clearExplainer}>
            <input type="hidden" name="id" value={row.id} />
            <button type="submit" className="admin-btn admin-btn-ghost">
              Clear & unlock
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function formatMeetingType(t: string): string {
  switch (t) {
    case "regular": return "Regular";
    case "special": return "Special";
    case "committee": return "Committee";
    case "work_session": return "Work session";
    default: return t;
  }
}

export const dynamic = "force-dynamic";
