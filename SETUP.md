# PeachTracker — Supabase backend setup

Phase 1 ("foundation") is done in the repo. This checklist walks you through the manual steps that only you can do, then the steps I can help finish in the next session.

## What's in the repo now

- `supabase/migrations/0001_initial_schema.sql` — all 11 tables, indexes, RLS policies, realtime publication. Idempotent (safe to re-run).
- `supabase/seed.sql` — May 19, 2026 primary (8 contested + 8 unopposed races, exact candidate list from `may-primary`) and the April 14 District 5 runoff with full vote timeline.
- `web/` — Next.js 15 App Router scaffold with Tailwind, PeachTracker design tokens, Supabase server + browser clients, and a working proof-of-concept at `/elections/[id]` that subscribes to realtime changes on `candidates` and `races`.
- Existing root files (`index.html`, `history.html`, `election-data.json`) are untouched. Current `may-primary` deploy still works.

## Your steps

### 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → **New project**
2. Name: `peachtracker`
3. Region: pick the closest US region (`us-east-1` or `us-east-2` — closest to Macon-Bibb)
4. Database password: generate a strong one and stash it in your password manager
5. Plan: Free
6. Wait ~2 minutes for provisioning

### 2. Run the migration

1. In the Supabase dashboard, open **SQL Editor**
2. Paste the entire contents of `supabase/migrations/0001_initial_schema.sql`
3. Click **Run**. You should see "Success. No rows returned."
4. Go to **Table Editor** and confirm 11 tables exist

### 3. Seed the data

1. In the same SQL Editor, open a new query
2. Paste the entire contents of `supabase/seed.sql`
3. Click **Run**
4. Verify:
   - `elections` has 2 rows (May 19 primary, April 14 D5 runoff)
   - `races` has 9 rows (8 May contested + 1 D5)
   - `candidates` has 21 rows
   - `unopposed_races` has 8 rows
   - `result_snapshots` has 12 rows (6 timeline points × 2 candidates)

### 4. Share credentials with me

I need two strings from **Settings → API**:

- **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
- **anon public key** — long JWT starting with `eyJ…`

The anon key is safe to share (it's the public client key; RLS restricts writes). Do NOT share the `service_role` key.

### 5. (Optional now, required before May 19) Connect Supabase to Vercel

1. Supabase dashboard → **Integrations** → **Vercel**
2. Authorize, select the `peachtracker` Vercel project
3. This auto-injects `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` into all Vercel environments
4. No manual env var copy-pasting ever

We can defer this until we're ready to flip Vercel's project root to `web/`.

## What I'll do next session

Once you've done steps 1–4 above and shared credentials:

1. Add `.env.local` in `web/` with your Supabase URL + anon key
2. Run `npm install` inside `web/` to resolve deps (can't do it now — sandbox network is restricted for installs)
3. Run `npm run build` and `npm run dev` to prove the stack works end-to-end
4. Port the PeachTracker race card UI from `index.html` (party badges, 2-candidate vs multi-candidate layouts, called banners, unopposed grid) onto the React components
5. Build the admin page (`/admin` with Supabase Auth, vote update form)
6. Build the blog page + blog admin
7. Build the civic hub home page
8. Port the history page and wire it to `elections` where `status IN ('final','certified')`
9. Flip the Vercel project root from `/` (static site) to `/web` and deploy

## Branch strategy

Because my sandbox can't release a stale git lock on `.git/HEAD.lock`, I couldn't create a new branch from here. When you're next at your local clone:

```bash
cd ~/Documents/Claude/Projects/PeachTracker
git fetch
git checkout -b supabase-backend main   # branch from main, not may-primary
git pull --rebase  # pull anything new from your sandbox workspace if you've synced it
# verify the new files are present:
ls supabase/ web/
git add supabase/ web/ SETUP.md
git commit -m "Phase 1: Supabase schema, seed, and Next.js scaffold"
git push -u origin supabase-backend
```

Do NOT merge to `main` until Phase 2 is done and the site is verified on the preview URL. `may-primary` stays the live election-night build until we've migrated it to Supabase.

## Don't do any of this yet

- Don't change the Vercel project root. `web/` isn't runnable until `npm install` has run.
- Don't delete `index.html`, `election-data.json`, or the `may-primary` branch. Those are the fallback if anything in the Supabase cutover goes sideways before May 19.

## Gotchas

- **Supabase free tier project pauses after 1 week of inactivity.** Log in or hit the API once a week until launch to keep it warm.
- **Realtime has a limit of 100 concurrent connections on free tier.** Should be fine for May 19 (first election peaked at 168 unique visitors, and most won't be on the page simultaneously).
- **RLS policies use `auth.role() = 'authenticated'`** for writes — meaning *any* logged-in Supabase user can write. When we wire up Supabase Auth, we'll either restrict to a specific user ID or add a `profiles` table with an `is_admin` flag. For now the only account will be yours.
