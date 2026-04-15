// Shared PeachTracker chrome — accent bar, sticky nav with logo, footer.
import Link from "next/link";

export function AccentBar() {
  return <div className="accent-bar" aria-hidden />;
}

export function SiteNav() {
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
        <div
          style={{
            display: "flex",
            gap: 28,
            alignItems: "center",
          }}
        >
          <Link
            href="/elections"
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            Elections
          </Link>
          <Link
            href="/commission"
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            Commission
          </Link>
        </div>
      </div>
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
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
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
          <div className="footer-meta">© {new Date().getFullYear()} · Made in Macon</div>
        </div>
      </div>
    </footer>
  );
}
