// Shared PeachTracker chrome — accent bar, sticky nav with logo, footer.
// Used by every page so the site feels cohesive.
import Link from "next/link";

export function AccentBar() {
  return <div className="accent-bar" aria-hidden />;
}

export function SiteNav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo-link" aria-label="PeachTracker home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="nav-logo"
            src="/images/peachlogo2-remove-bg-io.png"
            alt="PeachTracker"
          />
        </Link>
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
        <div className="footer-meta">© {new Date().getFullYear()} · Made in Macon</div>
      </div>
    </footer>
  );
}
