// Shared PeachTracker chrome — accent bar, sticky nav with logo, footer.
"use client";

import { useState } from "react";
import Link from "next/link";

export function AccentBar() {
  return <div className="accent-bar" aria-hidden />;
}

const NAV_LINKS = [
  { href: "/elections", label: "Elections" },
  { href: "/ask", label: "Ask Mulberry" },
  { href: "/blog", label: "Civic Desk" },
  { href: "/about", label: "About" },
];

const navLinkStyle: React.CSSProperties = {
  fontSize: "var(--kicker)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "var(--text)",
  textDecoration: "none",
};

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="nav">
      <div className="nav-inner" style={{ justifyContent: "space-between" }}>
        <Link href="/" className="nav-logo-link" aria-label="PeachTracker home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="nav-logo"
            src="/images/peachlogo2-remove-bg-io.png"
            alt="PeachTracker"
          />
        </Link>

        {/* Desktop nav links */}
        <div className="nav-links-desktop">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} style={navLinkStyle}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger button */}
        <button
          className="nav-hamburger"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          <span
            style={{
              display: "block",
              width: 22,
              height: 2,
              background: "var(--text)",
              transition: "transform 200ms ease, opacity 200ms ease",
              transform: open ? "rotate(45deg) translate(4px, 4px)" : "none",
            }}
          />
          <span
            style={{
              display: "block",
              width: 22,
              height: 2,
              background: "var(--text)",
              marginTop: 5,
              transition: "opacity 200ms ease",
              opacity: open ? 0 : 1,
            }}
          />
          <span
            style={{
              display: "block",
              width: 22,
              height: 2,
              background: "var(--text)",
              marginTop: 5,
              transition: "transform 200ms ease, opacity 200ms ease",
              transform: open ? "rotate(-45deg) translate(4px, -4px)" : "none",
            }}
          />
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="nav-mobile-menu">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                ...navLinkStyle,
                display: "block",
                padding: "14px var(--gutter)",
                borderTop: "1px solid var(--border)",
              }}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="footer-logo"
          src="/images/peachlogo2-remove-bg-io.png"
          alt="PeachTracker"
        />
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/elections"
            style={{
              fontSize: "var(--micro)",
              color: "var(--text-light)",
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "0.04em",
            }}
          >
            All elections
          </Link>
          <Link
            href="/about"
            style={{
              fontSize: "var(--micro)",
              color: "var(--text-light)",
              fontWeight: 500,
              textDecoration: "none",
              letterSpacing: "0.04em",
            }}
          >
            About
          </Link>
          <div className="footer-meta">© {new Date().getFullYear()} · Made in Macon</div>
        </div>
      </div>
    </footer>
  );
}
