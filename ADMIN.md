# PeachTracker Admin — election night playbook

## Sign-in credentials

- **URL**: `/admin/login`
- **Email**: jaylan@jaylanscott.com
- **Temporary password**: `peachtracker-temp-2026`

**Change the password immediately** after first login at `/admin/account`. The temp password is stored in this doc and should not be considered secure.

## Admin capabilities

**Dashboard (`/admin`)**: Lists all elections. Pick one to open the vote updater.

**Vote updater (`/admin/elections/[id]`)**:
- One form per race, scoped so you can save a single race without touching others
- Edit each candidate's vote count with a number input (right-aligned, tabular-nums for easy scanning)
- Set precincts reporting / total precincts per race
- Check "Call this race" + enter the winner name → flips the race's `called` flag and shows the call banner on the public page
- Optional snapshot note (e.g. "Early vote", "First precinct in") — stored in `result_snapshots` for the timeline
- Each save also updates the election's `last_updated` to the current HH:MM (ET)

**Election settings (inside the vote updater)**: Flip status between `upcoming` / `live` / `final` / `certified`. Edit the free-text `last_updated` display.

**Change password (`/admin/account`)**: Rotate your password any time.

## Election night workflow

1. Before polls close: set election status to `live`
2. As each precinct reports:
   - Update vote counts per candidate
   - Bump `precincts_reporting` for that race
   - Add a snapshot note if it's a meaningful milestone (e.g. "First precinct in")
   - Hit **Save** for that race
3. Public site updates **instantly** via Supabase Realtime (no refresh needed)
4. When a race is clear: check "Call this race" + enter winner → big call banner on public page
5. When the whole election is done: set status to `final`, then `certified` once the board confirms

## Target pace

From the spec: **8 races updated in under 2 minutes**. The per-race form design supports this — each race is a separate form, so you can tab through candidates, hit Save, and move on. No waiting for an all-races batch submit.

## Security

- RLS restricts writes to users with `profiles.is_admin = true`
- Only your account has `is_admin = true`
- Middleware gates `/admin/*` to authenticated users and bounces to login if the session expires
- Even if someone signs up through Supabase Auth directly (which you haven't exposed), they can't write to election tables — the `is_admin()` policy blocks them

## If you get locked out

- Forgot password → currently no reset flow. Ask me next session to add Supabase Auth's built-in email reset, or reset the password directly via the Supabase dashboard → Authentication → Users
- Lost admin flag → reset via Supabase SQL editor: `update profiles set is_admin = true where email = 'jaylan@jaylanscott.com';`
