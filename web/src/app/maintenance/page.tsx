// Branded maintenance / coming-soon splash. Shown to all non-admin visitors
// when MAINTENANCE_MODE=true in Vercel. Admins who are signed in bypass this
// via the middleware check. Returns a 503 so search engines know to come
// back later rather than deindex the site.

import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "We'll be right back · PeachTracker",
  description: "PeachTracker is getting a tune-up. We'll be back online shortly.",
  robots: { index: false, follow: false },
};

// force 503 status code — good SEO hygiene for planned downtime
export const dynamic = "force-dynamic";

export default function MaintenancePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: "var(--bg, #FFFBF5)",
        color: "var(--text, #1a1a1a)",
      }}
    >
      {/* Animated peach gradient + soft floating blobs. All CSS; no JS; no
          runtime cost. Respects prefers-reduced-motion. */}
      <style>{`
        @keyframes pt-drift {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(30px, -40px) scale(1.08); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes pt-drift-2 {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-24px, 36px) scale(0.92); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes pt-shimmer {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        @keyframes pt-float-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pt-logo-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.015); }
        }
        .pt-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          pointer-events: none;
          will-change: transform;
        }
        .pt-blob-1 { top: -120px; left: -80px;  width: 480px; height: 480px; background: #FFB37A; animation: pt-drift 18s ease-in-out infinite, pt-shimmer 9s ease-in-out infinite; }
        .pt-blob-2 { top:  20%;  right: -140px; width: 520px; height: 520px; background: #FF8A65; animation: pt-drift-2 22s ease-in-out infinite, pt-shimmer 11s ease-in-out infinite; }
        .pt-blob-3 { bottom: -160px; left: 30%; width: 600px; height: 600px; background: #6FCF97; animation: pt-drift 26s ease-in-out infinite; opacity: 0.35; }

        .pt-fade-1 { animation: pt-float-in 0.8s ease-out 0.1s both; }
        .pt-fade-2 { animation: pt-float-in 0.8s ease-out 0.3s both; }
        .pt-fade-3 { animation: pt-float-in 0.8s ease-out 0.5s both; }
        .pt-fade-4 { animation: pt-float-in 0.8s ease-out 0.7s both; }
        .pt-fade-5 { animation: pt-float-in 0.8s ease-out 0.9s both; }

        .pt-logo { animation: pt-logo-pulse 4s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .pt-blob, .pt-logo, .pt-fade-1, .pt-fade-2, .pt-fade-3, .pt-fade-4, .pt-fade-5 {
            animation: none !important;
          }
        }

        .pt-admin-link {
          color: var(--text-light, #8a8a8a);
          text-decoration: none;
          transition: color 0.2s ease;
          font-size: 0.82rem;
          letter-spacing: 0.02em;
        }
        .pt-admin-link:hover { color: var(--peach, #FF7A42); }
      `}</style>

      {/* Animated background */}
      <div className="pt-blob pt-blob-1" aria-hidden="true" />
      <div className="pt-blob pt-blob-2" aria-hidden="true" />
      <div className="pt-blob pt-blob-3" aria-hidden="true" />

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "56px 24px",
          position: "relative",
          zIndex: 1,
          textAlign: "center",
        }}
      >
        <div className="pt-fade-1 pt-logo" style={{ marginBottom: 28 }}>
          <Image
            src="/images/peachlogo2-remove-bg-io.png"
            alt="PeachTracker"
            width={140}
            height={140}
            priority
            style={{ height: "auto", width: "clamp(96px, 18vw, 140px)" }}
          />
        </div>

        <p
          className="pt-fade-2"
          style={{
            fontSize: "var(--kicker, 0.72rem)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.22em",
            color: "var(--peach, #FF7A42)",
            marginBottom: 20,
          }}
        >
          Back soon
        </p>

        <h1
          className="pt-fade-3"
          style={{
            fontWeight: 900,
            fontSize: "clamp(2.25rem, 6vw, 4rem)",
            letterSpacing: "-0.035em",
            lineHeight: 1.02,
            marginBottom: 20,
            maxWidth: "18ch",
          }}
        >
          We&apos;re polishing a few things.
        </h1>

        <p
          className="pt-fade-4"
          style={{
            fontSize: "clamp(1.05rem, 1.8vw, 1.2rem)",
            lineHeight: 1.5,
            color: "var(--text-secondary, #555)",
            maxWidth: "46ch",
            fontWeight: 450,
          }}
        >
          PeachTracker is getting a tune-up before relaunch. Civic
          accountability for Macon-Bibb, served a little sweeter.
        </p>

        <div
          className="pt-fade-5"
          style={{
            marginTop: 36,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: "0.9rem",
            color: "var(--text-light, #8a8a8a)",
          }}
        >
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--peach, #FF7A42)", display: "inline-block" }} />
          Relaunching soon
        </div>
      </div>

      {/* Footer with admin bypass */}
      <footer
        style={{
          position: "relative",
          zIndex: 1,
          padding: "20px 24px 28px",
          textAlign: "center",
          borderTop: "1px solid rgba(0,0,0,0.06)",
          background: "rgba(255,251,245,0.6)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Link href="/admin/login" className="pt-admin-link">
          Admin sign in →
        </Link>
      </footer>
    </main>
  );
}
