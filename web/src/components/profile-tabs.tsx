"use client";

// Tabbed switcher for the commissioner profile: Votes (default) | In the news.
// Server component passes both panels as children so we don't have to pass
// complex data across the client boundary.
//
// Why client-side tabs instead of query-param navigation: the whole page is
// SSR'd dynamically. Flipping tabs via `?tab=news` would cause a full
// round-trip every time, which feels slow on a content-heavy page. Local
// state is cheap and smooth.

import { useState } from "react";
import type { ReactNode } from "react";

interface TabDef {
  id: string;
  label: string;
  count?: number;
  panel: ReactNode;
}

export function ProfileTabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);

  return (
    <div>
      <div
        role="tablist"
        style={{
          display: "flex",
          borderBottom: "1.5px solid var(--border)",
          marginBottom: 32,
          gap: 0,
          overflowX: "auto",
        }}
      >
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              style={{
                background: "transparent",
                border: "none",
                padding: "12px 20px 14px",
                fontSize: "var(--body)",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: isActive ? "var(--text)" : "var(--text-secondary)",
                cursor: "pointer",
                position: "relative",
                marginBottom: "-1.5px",
                borderBottom: isActive ? "3px solid var(--peach)" : "3px solid transparent",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: "var(--micro)",
                    fontWeight: 600,
                    color: "var(--text-light)",
                    fontFeatureSettings: '"tnum" 1',
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          hidden={t.id !== active}
          style={{ display: t.id === active ? "block" : "none" }}
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
