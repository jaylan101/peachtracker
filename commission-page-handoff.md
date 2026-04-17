# Handoff prompt — PeachTracker Commission sync brainstorm

> Copy everything below the line into Claude.ai.
> Goal: brainstorm *approaches* to the sync bug. **Don't produce a fix or final code** — I'll bring the direction back to Cowork to implement.

---

I need a thinking partner on a bug, not an implementer. Please **don't write final code or hand me a fix**. I want to leave this chat with a clear theory of the root cause and 2–3 candidate approaches I can evaluate. I'll do the actual implementation elsewhere.

**Note on prior work:** I checked — there's no previous debugging on this specific 2025/2026 sync symptom in another chat. The sync route was built in an earlier Cowork task but that work isn't in git history (the `web/` folder has uncommitted changes), so there's no commit trail to mine. The code as it stands today is ground truth. If you ask me "what have you already tried," the honest answer is "nothing systematic yet — this is the first real look at why newer meetings aren't showing up."

## Context

I'm building **PeachTracker**, a civic accountability site for Macon-Bibb County, Georgia. The page in question is the **Commission tracker** at `/commission` — a list of county commission meetings, agenda items, and how each commissioner voted. The page reads from Supabase; Supabase is populated by a sync that pulls from the county's **CivicClerk** public API. Reads are public, writes gated by RLS. Mission is civic access, so missing meetings is a real problem.

## The specific symptom

When I run the sync from the admin UI:

- The status widget says **"32 meetings synced from CivicClerk · + 2 additional DB meetings to process"** and shows "Meeting 7/34" ticking.
- So the sync *is* pulling meetings and *is* advancing through them.
- But on `/commission`, I see **2024 meetings**, and **nothing from 2025 or 2026** — even though I know 2025 and 2026 meetings exist in CivicClerk and the sync is counting them.

So the "isn't pulling all the meetings" framing I started with is wrong. The sync is pulling them, but newer meetings aren't making it to the rendered page. Something between "counted by the sync" and "visible on /commission" is dropping 2025–2026.

## How the sync works today

Next.js route at `/api/sync-civicclerk/route.ts`, two-phase to stay under Vercel's function timeout:

- **`phase=meetings`** — paginates `GET /v1/Events?$top=100` (follows `@odata.nextLink`), filters to `categoryName === "Board of Commissioners"` with `(hasAgenda || isPublished === "Published") && agendaId`, upserts a `meetings` row keyed on `civicclerk_event_id`. Returns the Supabase meeting UUIDs.
- **`phase=items&id=<uuid>`** — for a given meeting, fetches `GET /v1/Meetings/{agendaId}`, walks nested `items`, upserts `agenda_items`, pulls votes from embedded `minutesItemVotes` or the dedicated `GetMeetingItemMinutesVotes(id=<itemId>)` endpoint, upserts `commission_votes`. Marks meeting's `minutes_url = "synced"`.
- **`phase=sync-by-agendaid&agendaid=<n>`** — escape hatch for meetings that exist in `Meetings/` but didn't come back from `Events`. **Uses a placeholder date** derived from `2025-${(agendaId % 12)+1}-${(agendaId % 28)+1}` so the `(date, type)` unique constraint doesn't collide. This smells bad and may be relevant.
- **`GET ?debug=1`** — raw `Events` count, filtered count, sample, and `allCategories`.

Filter values that matter:

```ts
const COMMISSION_CATEGORIES = ["Board of Commissioners"];
// commEvents = events.filter(e =>
//   COMMISSION_CATEGORIES.includes(e.categoryName) &&
//   (e.hasAgenda || e.isPublished === "Published") &&
//   e.agendaId
// );
```

Meeting type from `eventName`: `"pre-commission"`/`"pre commission"` → `work_session`; `"special"`/`"called"` → `special`; `"committee"` → `committee`; `"public hearing"` → `special`; else `regular`.

Upsert pattern is `.upsert(..., { onConflict: "civicclerk_event_id" })` then a separate `.select()` to get the id — because chained `.select()` on conflict was returning null.

## Where I think the bug lives (theories, not conclusions)

Help me sort these — or tell me I'm missing one.

1. **`(meeting_date, meeting_type)` unique constraint is rejecting 2025–2026 rows** because the `sync-by-agendaid` escape hatch has previously written placeholder `2025-MM-DD` rows using the modulo formula. Real 2025 meetings on those dates/types would collide. Upsert is on `civicclerk_event_id`, so if the placeholder rows have `civicclerk_event_id = NULL`, a new real row with a different event_id but the same `(date, type)` could fail the secondary unique constraint. **If this is the cause, older 2024 rows are fine because they predate the escape hatch.**
2. **`/commission` is paginating or date-filtering** and 2025–2026 are outside the window. The index query is `meetings(...).order("meeting_date", { ascending: false }).limit(12)`. If a batch of placeholder-dated 2025 rows (from the escape hatch) sort ahead of real meetings, they could be eating the 12 slots. 2024 shows up because it's ordering by date ascending-false on a mix of real + placeholder rows.
3. **`phase=items` is silently erroring on 2025–2026** and the rows exist but without items, so they display as empty cards — but if I'm seeing *no* 2025/2026 entries at all, that points away from this theory.
4. **Published-status filter drops newer meetings.** The filter is `hasAgenda || isPublished === "Published"`. If 2025–2026 CivicClerk events use a different string ("Draft", null, a new enum value), they'd be excluded. But the status widget saying "32 meetings synced" makes this less likely unless "32" is all-historical and the loop just didn't include the newest ones.
5. **Pagination order / truncation.** `fetchAllEvents` bails on any non-ok response (`if (!r.ok) break`). If page 3 of the Events pagination 429s, everything beyond it is silently dropped. If the API returns newest-first, truncation would hit *older* meetings, not newer — but if it returns oldest-first, newer meetings would be silently dropped and the widget would still say "synced" for everything it got.
6. **Two writes, one key.** Upsert on `civicclerk_event_id`, then `.select()` by `civicclerk_event_id`. If a historical placeholder row exists with that event_id set to something weird (or the escape hatch wrote `civicclerk_event_id: undefined`, which Supabase may coerce), the select can miss.

## Constraints

- Reads public, writes gated by RLS `is_admin()`. Can't relax.
- Vercel function timeout is why the sync is phased — a "just do it in one request" answer won't work.
- I can't change CivicClerk. Fix lives in my code / my schema.
- I'll do a migration if that's the real answer, but I'd rather not.

## What I want from you

1. **Rank my six theories** — most likely first — and tell me why, based on what the code and the symptom actually say. If the right answer isn't on the list, add it.
2. **Give me 2–3 *distinct* approaches** to a fix. Not variations — actually different strategies. Example shape: (a) drop the placeholder-date hack and widen/replace the unique constraint; (b) add a reconciliation pass that diffs Events API against Supabase by year and reports gaps; (c) stop relying on `(date, type)` uniqueness entirely and dedupe on CivicClerk IDs. For each, give the tradeoffs that actually matter: blast radius on existing rows, migration needed or not, interaction with the two-phase timeout, how I'd back it out.
3. **Give me the 10-minute diagnostics** that would collapse the decision tree — the exact queries or endpoint calls I should run to confirm which theory is right before I touch anything. (E.g. "SELECT meeting_date, meeting_type, civicclerk_event_id FROM meetings WHERE meeting_date >= '2025-01-01' ORDER BY meeting_date — look for the placeholder cluster," or "hit `?debug=1` and count `commissionWithAgenda` events with `startDateTime >= '2025-01-01'` and compare to DB.")
4. **Push back** if two of my theories are the same bug in disguise, or if the escape hatch is the actual cause rather than a symptom.

**Please don't:**
- Write me a fixed `route.ts`.
- Suggest I switch APIs — I'm stuck with CivicClerk.
- Restyle or redesign anything. This is a data-completeness problem.

Deliverable: three sentences I can come back to Cowork with — "the root cause is probably X, I'm going to try approach Y, and before I start I'll verify Z."
