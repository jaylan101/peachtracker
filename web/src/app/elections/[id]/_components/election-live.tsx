"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Candidate, Election, Race } from "@/lib/supabase/types";

/**
 * ElectionLive — pixel-matches the production site's head-to-head layout
 * (candidate row with peach/green split, giant percentages, split bar,
 * stats strip) and repeats it per race for multi-race elections.
 *
 * Realtime: subscribes to postgres_changes on `candidates` and `races`.
 * When the admin updates vote counts, the visible numbers patch in place.
 * A 60s polling fallback covers dropped realtime connections.
 */
export function ElectionLive({
  election,
  initialRaces,
  initialCandidates,
}: {
  election: Election;
  initialRaces: Race[];
  initialCandidates: Candidate[];
}) {
  const [races, setRaces] = useState<Race[]>(initialRaces);
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [connected, setConnected] = useState(false);

  const raceIdSet = useMemo(
    () => new Set(races.map((r) => r.id)),
    [races],
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`election:${election.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "races" },
        (payload) => {
          const u = payload.new as Race;
          if (u.election_id !== election.id) return;
          setRaces((prev) => prev.map((r) => (r.id === u.id ? u : r)));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candidates" },
        (payload) => {
          const u = payload.new as Candidate;
          setCandidates((prev) => {
            if (!prev.some((c) => c.id === u.id)) return prev;
            return prev.map((c) => (c.id === u.id ? u : c));
          });
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    // Polling fallback
    const interval = setInterval(async () => {
      const [{ data: r }, { data: c }] = await Promise.all([
        supabase
          .from("races")
          .select("*")
          .eq("election_id", election.id)
          .order("sort_order"),
        supabase
          .from("candidates")
          .select("*, races!inner(election_id)")
          .eq("races.election_id", election.id)
          .order("sort_order"),
      ]);
      if (r) setRaces(r as Race[]);
      if (c) setCandidates(c as Candidate[]);
    }, 60_000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [election.id]);

  // Group candidates by race
  const byRace = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    for (const c of candidates) {
      if (!raceIdSet.has(c.race_id)) continue;
      const list = map.get(c.race_id) ?? [];
      list.push(c);
      map.set(c.race_id, list);
    }
    for (const [k, list] of map) {
      list.sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a.sort_order - b.sort_order;
      });
      map.set(k, list);
    }
    return map;
  }, [candidates, raceIdSet]);

  // For a single-race election (like D5 runoff), promote its race call to a
  // top-level banner above the results (matches production site).
  const singleRace = races.length === 1 ? races[0] : null;
  const singleRaceCalled = singleRace?.called && singleRace?.winner;

  return (
    <>
      {singleRaceCalled && (
        <div className="call-band">
          <div className="call-inner">
            <span className="call-flag">🍑 PeachTracker calls this race</span>
            <span className="call-winner">
              {singleRace.winner} wins{raceShortSuffix(singleRace)}
            </span>
          </div>
        </div>
      )}

      <div className="results-band">
        <section className="results">
          <div className="results-head">
            <div className="results-head-title">{election.name}</div>
            <div className="results-head-meta">
              <span>
                Date
                <strong>{formatDate(election.election_date)}</strong>
              </span>
              <span>
                Status
                <strong style={{ textTransform: "capitalize" }}>
                  {election.status}
                </strong>
              </span>
              {election.last_updated && (
                <span>
                  Updated
                  <strong>{election.last_updated}</strong>
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
            <span className="rt-chip">
              <span className={`rt-dot ${connected ? "is-live" : ""}`} />
              {connected ? "Live" : "Reconnecting…"}
            </span>
          </div>

          <div style={{ display: "grid", gap: 48 }}>
            {races.length === 0 && (
              <p style={{ color: "var(--text-secondary)" }}>
                No races are in this election yet.
              </p>
            )}

            {races.map((race) => {
              const list = byRace.get(race.id) ?? [];
              return (
                <RaceBlock
                  key={race.id}
                  race={race}
                  candidates={list}
                  // Only show per-race call banner for multi-race elections;
                  // single-race elections already got the big top banner.
                  showCallBanner={!singleRace && race.called && !!race.winner}
                />
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * RaceBlock — production 2-candidate head-to-head layout when the race has
 * exactly 2 candidates. Falls back to a tidy ranked list (same palette,
 * same type hierarchy) when 3+ candidates.
 */
function RaceBlock({
  race,
  candidates,
  showCallBanner,
}: {
  race: Race;
  candidates: Candidate[];
  showCallBanner: boolean;
}) {
  if (candidates.length === 2) {
    return (
      <TwoCandidateRace
        race={race}
        candidates={candidates}
        showCallBanner={showCallBanner}
      />
    );
  }
  return (
    <MultiCandidateRace
      race={race}
      candidates={candidates}
      showCallBanner={showCallBanner}
    />
  );
}

function TwoCandidateRace({
  race,
  candidates,
  showCallBanner,
}: {
  race: Race;
  candidates: Candidate[];
  showCallBanner: boolean;
}) {
  const [c1, c2] = candidates;
  const total = c1.votes + c2.votes;
  const pct1Raw = total > 0 ? (c1.votes / total) * 100 : 50;
  const pct1 = Math.round(pct1Raw * 10) / 10;
  const pct2 = Math.round((100 - pct1) * 10) / 10;

  // Leader on the peach side (left), trailer on green (right)
  const aLeading = c1.votes >= c2.votes;
  const a = aLeading ? c1 : c2;
  const b = aLeading ? c2 : c1;
  const aPct = aLeading ? pct1 : pct2;
  const bPct = aLeading ? pct2 : pct1;
  const margin = Math.abs(c1.votes - c2.votes);
  const partyTag = partyLabel(race.type);

  return (
    <article style={{ position: "relative" }}>
      {/* Per-race header when part of a multi-race election */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
          paddingBottom: 10,
          borderBottom: "1.5px solid var(--border)",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: partyColor(race.type),
            }}
          >
            {race.category}
            {partyTag && (
              <>
                {" · "}
                <span>{partyTag}</span>
              </>
            )}
          </div>
          <h3
            style={{
              fontWeight: 800,
              fontSize: "1.15rem",
              letterSpacing: "-0.015em",
              marginTop: 4,
            }}
          >
            {race.name}
          </h3>
        </div>
        <div
          style={{
            fontSize: "var(--micro)",
            color: "var(--text-secondary)",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {race.precincts_reporting} of {race.total_precincts} precincts
        </div>
      </div>

      {showCallBanner && (
        <div className="call-band" style={{ marginBottom: 0 }}>
          <div className="call-inner">
            <span className="call-flag">🍑 PeachTracker calls this race</span>
            <span className="call-winner">{race.winner} wins</span>
          </div>
        </div>
      )}

      {/* Head-to-head candidate row */}
      <div className="cand-row">
        <div className={`cand cand-a ${aLeading ? "" : "trailing"}`}>
          <div className="cand-photo">
            {a.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.image_url} alt={a.name} />
            ) : (
              <InitialsTile name={a.name} variant="peach" />
            )}
          </div>
          <div className="cand-info">
            <div className="cand-tag">{aLeading ? "Leading" : "Trailing"}</div>
            <div className="cand-name">
              {a.name}
              {a.incumbent && (
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: "var(--text-light)",
                    marginLeft: 8,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  (Incumbent)
                </span>
              )}
            </div>
            <div className="cand-pct">{aPct.toFixed(1)}%</div>
            <div className="cand-votes">{a.votes.toLocaleString()} votes</div>
          </div>
        </div>
        <div className={`cand cand-b ${aLeading ? "trailing" : ""}`}>
          <div className="cand-photo">
            {b.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/${b.image_url}`} alt={b.name} />
            ) : (
              <InitialsTile name={b.name} variant="green" />
            )}
          </div>
          <div className="cand-info">
            <div className="cand-tag">{aLeading ? "Trailing" : "Leading"}</div>
            <div className="cand-name">
              {b.name}
              {b.incumbent && (
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: "var(--text-light)",
                    marginLeft: 8,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  (Incumbent)
                </span>
              )}
            </div>
            <div className="cand-pct">{bPct.toFixed(1)}%</div>
            <div className="cand-votes">{b.votes.toLocaleString()} votes</div>
          </div>
        </div>
      </div>

      {/* Split bar */}
      <div className="split-bar">
        <div className="split-peach" style={{ width: `${aPct}%` }}>
          <span className="split-label">{aPct.toFixed(1)}%</span>
        </div>
        <div className="split-green" style={{ width: `${bPct}%` }}>
          <span className="split-label">{bPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Stats strip */}
      <div className="stats">
        <div className="stat-first">
          <div className="stat-label">
            <span style={{ color: aLeading ? "var(--peach)" : "var(--green)" }}>
              {a.name}
            </span>{" "}
            leading by
          </div>
          <div className="stat-value">
            {margin.toLocaleString()}{" "}
            <span className="stat-suffix">votes</span>
          </div>
        </div>
        <div>
          <div className="stat-label">Total Votes</div>
          <div className="stat-value">{total.toLocaleString()}</div>
        </div>
        <div>
          <div className="stat-label">Precincts In</div>
          <div className="stat-value">
            {race.precincts_reporting} / {race.total_precincts}
          </div>
        </div>
        <div className="stat-timestamp">
          Source: Macon-Bibb Board of Elections
          <br />
          Last updated{" "}
          <strong>
            {race.precincts_reporting === race.total_precincts
              ? "FINAL"
              : `${race.precincts_reporting} of ${race.total_precincts} precincts`}
          </strong>
        </div>
      </div>
    </article>
  );
}

function MultiCandidateRace({
  race,
  candidates,
  showCallBanner,
}: {
  race: Race;
  candidates: Candidate[];
  showCallBanner: boolean;
}) {
  const total = candidates.reduce((s, c) => s + c.votes, 0);
  const partyTag = partyLabel(race.type);

  return (
    <article>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
          paddingBottom: 10,
          borderBottom: "1.5px solid var(--border)",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: partyColor(race.type),
            }}
          >
            {race.category}
            {partyTag && (
              <>
                {" · "}
                <span>{partyTag}</span>
              </>
            )}
          </div>
          <h3
            style={{
              fontWeight: 800,
              fontSize: "1.15rem",
              letterSpacing: "-0.015em",
              marginTop: 4,
            }}
          >
            {race.name}
          </h3>
        </div>
        <div
          style={{
            fontSize: "var(--micro)",
            color: "var(--text-secondary)",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {race.precincts_reporting} of {race.total_precincts} precincts
        </div>
      </div>

      {showCallBanner && (
        <div className="call-band" style={{ marginBottom: 0 }}>
          <div className="call-inner">
            <span className="call-flag">🍑 PeachTracker calls this race</span>
            <span className="call-winner">{race.winner} wins</span>
          </div>
        </div>
      )}

      <div
        style={{
          background: "var(--card)",
          border: "1.5px solid var(--border)",
          display: "grid",
        }}
      >
        {candidates.map((c, i) => {
          const pct = total === 0 ? 0 : (c.votes / total) * 100;
          const leading = i === 0 && total > 0;
          const accentColor = leading ? "var(--peach)" : "var(--text-secondary)";
          return (
            <div
              key={c.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: 24,
                padding: "20px 28px",
                borderBottom:
                  i < candidates.length - 1 ? "1.5px solid var(--border)" : "none",
                background: leading ? "var(--peach-bg)" : "var(--card)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: "1.1rem",
                    letterSpacing: "-0.015em",
                    color: leading ? "var(--peach)" : "var(--text)",
                  }}
                >
                  {c.name}
                  {c.incumbent && (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        color: "var(--text-light)",
                        marginLeft: 8,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      (Incumbent)
                    </span>
                  )}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    height: 10,
                    background: "var(--border)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${pct}%`,
                      background: leading ? "var(--peach)" : "var(--peach-pastel)",
                      transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  />
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 120 }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: "2rem",
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    color: accentColor,
                    fontFeatureSettings: '"tnum" 1',
                  }}
                >
                  {pct.toFixed(1)}%
                </div>
                <div
                  style={{
                    fontSize: "var(--micro)",
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    marginTop: 4,
                    letterSpacing: "0.02em",
                    fontFeatureSettings: '"tnum" 1',
                  }}
                >
                  {c.votes.toLocaleString()} votes
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function InitialsTile({
  name,
  variant,
}: {
  name: string;
  variant: "peach" | "green";
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: variant === "peach" ? "var(--peach)" : "var(--green)",
        color: "#fff",
        fontWeight: 900,
        fontSize: "3.2rem",
        letterSpacing: "-0.02em",
      }}
    >
      {initials}
    </div>
  );
}

function partyLabel(type: Race["type"]): string | null {
  if (type === "democratic") return "Democratic primary";
  if (type === "republican") return "Republican primary";
  return null;
}

function partyColor(type: Race["type"]): string {
  if (type === "democratic") return "var(--dem, #2563EB)";
  if (type === "republican") return "var(--rep, #DC2626)";
  return "var(--text-secondary)";
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function raceShortSuffix(race: Race): string {
  // "Andrea Cooke wins District 5" — pulls the district from the race name
  const m = race.name.match(/District\s+\d+/i);
  return m ? ` ${m[0]}` : "";
}
