# PeachTracker

Live election results for Macon-Bibb County, Georgia — reported by the community as they're announced at the Board of Elections.

**On election night?** Go to [`ELECTION_NIGHT.md`](./ELECTION_NIGHT.md).

---

## Stack

Plain static HTML. No framework, no build step. Deployed to Vercel.

## Files

- `index.html` — the whole site (markup, styles, and render script)
- `images/` — candidate photos, logo
- `Fonts/` — Kurdis font source files (not currently used — kept for future use)
- `og-image.png` — 1200×630 social preview card
- `vercel.json` — deploy config
- `ELECTION_NIGHT.md` — playbook for updating during an active race
- `README.md` — this file

## Local preview

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy to Vercel (first-time setup)

### 1. Push to GitHub

Create a new repository on GitHub (can be public or private — your call). From this folder:

```bash
git init
git add -A
git commit -m "Initial PeachTracker site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/peachtracker.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New** → **Project**.
3. Import the `peachtracker` repo you just created.
4. **Framework Preset:** Other
5. **Root Directory:** `./` (default)
6. **Build Command:** leave empty
7. **Output Directory:** leave empty
8. Click **Deploy**.

First deploy takes ~30 seconds. Every subsequent `git push` to `main` auto-deploys.

### 3. (Optional) Custom domain

In Vercel → your project → **Settings** → **Domains** → **Add**. Vercel tells you what DNS records to set at your domain registrar.

## Election-night update workflow

The data that changes on election night lives in `RACE_DATA` near the top of `index.html`:

```js
const RACE_DATA = {
  race: "District 5 Special Election Runoff",
  date: "April 14, 2026",
  lastUpdated: "7:42 PM",
  precinctsReporting: { reported: 7, total: 12 },
  candidates: [
    { name: "Andrea Cook",   votes: 1247, color: "peach", photo: "images/andrea-cook.jpg"   },
    { name: "Edward Foster", votes: 1053, color: "green", photo: "images/edward-foster.jpg" }
  ]
};
```

**Easiest way to update on election night:** open Cowork, tell me the new numbers, I edit + commit + push. See [`ELECTION_NIGHT.md`](./ELECTION_NIGHT.md) for the full playbook.

**Manual way:** edit `index.html`, then:

```bash
git commit -am "Update: 9/12 precincts, 8:14 PM"
git push
```

Vercel auto-deploys in ~60 seconds.

## Design rules (don't break these)

- Flat design only. No `border-radius`, no shadows, no gradients.
- Font: Outfit (Google Fonts), weights 400–900.
- Palette tokens live in `:root` at the top of the `<style>` block.
- 1.5px borders on cards; 2px dark borders on nav, results header, and site footer.

## Disclaimer

PeachTracker is not affiliated with Macon-Bibb County government. Results displayed here are unofficial until certified by the Macon-Bibb County Board of Elections.
