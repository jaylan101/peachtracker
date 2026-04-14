# PeachTracker — Election Night Playbook

**This is the only doc you need on election night.** Keep Cowork open on your phone or laptop. Tell me updates in plain language. I'll commit and push.

---

## The 15-second update flow

1. Get the printout from the Board of Elections lobby.
2. Open Cowork, tell me the new numbers (any format that's clear — examples below).
3. I edit `index.html`, commit, push.
4. Vercel rebuilds in ~30–60 seconds.
5. Anyone who reloads peachtracker.[domain] sees the new numbers.

That's it. You don't touch code, you don't open GitHub, you don't remember commands.

---

## How to phrase updates

Any of these work — say it however feels natural:

- `Cook 1420, Foster 1198, 9 of 12, 8:14 PM`
- `update: 1420 / 1198, precincts 9/12, updated 8:14`
- `Andrea 1420 Ed 1198 9/12 8:14pm`
- `new numbers: cook is at 1420, foster 1198, we're at 9 out of 12 precincts now, time is 8:14`

If I'm not sure, I'll ask before pushing. **I will never push a change you didn't confirm.**

## What you can update

- **Candidate vote counts** (Andrea Cook's total, Edward Foster's total)
- **Precincts reporting** (e.g. 9 of 12)
- **Last updated time** (e.g. 8:14 PM)

Percentages, margin, total votes, and leading/trailing status are all calculated automatically from the vote counts — don't worry about them.

## What NOT to update mid-election

These shouldn't change on election night:
- Race name (`District 5 Special Election Runoff`)
- Date (`April 14, 2026`)
- Candidate names or photos
- Anything else

If one of these is wrong, tell me and I'll fix it — but ideally we lock these down before polls close.

---

## If something goes wrong

- **Vercel is slow to deploy** → refresh the site in 90 seconds. If still stale, tell me and I'll check the deploy status.
- **You fat-fingered a number** → just tell me the correct numbers. New commit, new deploy, new numbers live in ~60 seconds.
- **The site won't load for visitors** → tell me. I'll check Vercel's deployment log and the last git commit.
- **Cowork is slow or your connection drops** → you can also push from github.com on your phone: navigate to the repo → `index.html` → pencil icon → find `RACE_DATA`, edit votes, commit.

---

## Pre-election checklist

Run this 30 minutes before polls close:

- [ ] Site is live at its Vercel URL (or custom domain)
- [ ] Both candidate photos are showing, not broken
- [ ] Current "placeholder" numbers look right (we'll reset to `0, 0, 0/12` when polls close so the site doesn't show stale data during the count)
- [ ] You can reach Cowork on your phone
- [ ] You have the BoE lobby Wi-Fi password, or a phone hotspot backup
- [ ] You have the election night conversation with me already open

## When polls close (reset to zero)

Tell me: `reset for election night` — I'll zero out both candidates' vote counts, set precincts to `0 of 12`, and set the time. Site goes live in "0%" state, ready for the first precinct to report.

## After certification

Once the BoE certifies results (could be days later), tell me: `this race is certified` — I'll add a small "CERTIFIED" badge to the page and freeze the numbers. The "Results are unofficial until certified" disclaimer in the footer comes off.

---

## The actual file that matters

Everything hinges on this block near the top of `index.html`:

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

Three things change on election night: `lastUpdated`, `precinctsReporting.reported`, and each candidate's `votes`. I handle all of it — you don't need to memorize this.
