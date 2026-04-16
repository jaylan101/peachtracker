"use client";

// Election night timeline — shows how the vote totals evolved across the
// evening for a 2-candidate race. Reads from result_snapshots grouped by
// recorded_at timestamp. Used on past (certified/final) elections only.

import { useMemo } from "react";

interface SnapshotPoint {
  recorded_at: string;
  precincts_reporting: number;
  note: string | null;
  candidates: { name: string; votes: number }[];
}

interface TimelineProps {
  snapshots: SnapshotPoint[];
  totalPrecincts: number;
}

export function ElectionTimeline({ snapshots, totalPrecincts }: TimelineProps) {
  if (!snapshots || snapshots.length === 0) return null;

  // Find max votes for bar scaling
  const maxVotes = useMemo(() => {
    return Math.max(
      ...snapshots.flatMap((s) => s.candidates.map((c) => c.votes)),
      1,
    );
  }, [snapshots]);

  // Candidate names + color assignment (first = peach, second = green)
  const candidateNames = snapshots[0]?.candidates.map((c) => c.name) ?? [];

  return (
    <div
      style={{
        maxWidth: "var(--content)",
        margin: "0 auto",
        padding: "0 var(--gutter) 0",
      }}
    >
      <div
        style={{
          borderTop: "1.5px solid var(--border)",
          paddingTop: 16,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: "var(--kicker)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "var(--peach)",
          }}
        >
          How the night unfolded
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
        {candidateNames.map((name, i) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 12,
                height: 12,
                backgroundColor: i === 0 ? "var(--peach)" : "var(--green)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "var(--body)", fontWeight: 600, color: "var(--text)" }}>
              {name}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "var(--border)",
          border: "1.5px solid var(--border)",
          display: "grid",
          gap: "1.5px",
        }}
      >
        {snapshots.map((point, idx) => {
          const time = new Date(point.recorded_at).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/New_York",
          });
          const isFinal = point.precincts_reporting >= totalPrecincts;

          return (
            <div
              key={idx}
              style={{
                background: isFinal ? "var(--peach-bg)" : "var(--card)",
                padding: "16px 20px",
                display: "grid",
                gridTemplateColumns: "80px 1fr",
                gap: "20px",
                alignItems: "start",
              }}
            >
              {/* Time + precinct label */}
              <div>
                <div
                  style={{
                    fontSize: "var(--body)",
                    fontWeight: 700,
                    color: isFinal ? "var(--peach)" : "var(--text)",
                    fontFeatureSettings: '"tnum" 1',
                  }}
                >
                  {time}
                </div>
                <div
                  style={{
                    fontSize: "var(--micro)",
                    color: "var(--text-light)",
                    fontWeight: 500,
                    marginTop: 3,
                    lineHeight: 1.4,
                  }}
                >
                  {point.note ||
                    `${point.precincts_reporting} of ${totalPrecincts} precincts`}
                </div>
              </div>

              {/* Vote bars */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {point.candidates.map((c, ci) => {
                  const pct = point.candidates.reduce((sum, x) => sum + x.votes, 0) > 0
                    ? (c.votes / point.candidates.reduce((sum, x) => sum + x.votes, 0)) * 100
                    : 50;
                  const barColor = ci === 0 ? "var(--peach)" : "var(--green)";
                  const bgColor = ci === 0 ? "var(--peach-pastel)" : "var(--green-pastel)";

                  return (
                    <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          background: bgColor,
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            height: "100%",
                            width: `${Math.max(1, (c.votes / maxVotes) * 100)}%`,
                            background: barColor,
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: "var(--body)",
                          fontWeight: 700,
                          color: barColor,
                          minWidth: 80,
                          textAlign: "right",
                          fontFeatureSettings: '"tnum" 1',
                        }}
                      >
                        {c.votes.toLocaleString()}
                        <span
                          style={{
                            fontSize: "var(--kicker)",
                            fontWeight: 500,
                            color: "var(--text-secondary)",
                            marginLeft: 4,
                          }}
                        >
                          ({pct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
