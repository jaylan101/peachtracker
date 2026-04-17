"use client";

// Client-side maintenance splash.
//
// Visual: dark background with a <canvas> particle network — dots drift around
// the screen, and when two particles come within ~140px of each other a peach
// line is drawn between them. Cursor nudges nearby particles. Respects
// prefers-reduced-motion by rendering a static field instead of animating.
//
// Everything is self-contained; no animation libraries required.

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

export function MaintenanceSplash() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Mouse influence
    const mouse = { x: -9999, y: -9999, active: false };
    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);

    // Size canvas to viewport with DPR scaling
    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Particle count scales with screen area but capped
    const densityFactor = 0.00009; // particles per px^2
    const particleCount = Math.min(
      140,
      Math.max(50, Math.floor(width * height * densityFactor)),
    );

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      hue: number; // slight variation for warmth
    };

    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 1.2 + Math.random() * 1.6,
      hue: 18 + Math.random() * 16, // 18-34 = orange-ish
    }));

    const CONNECT_DIST = 140;
    const CONNECT_DIST_SQ = CONNECT_DIST * CONNECT_DIST;
    const MOUSE_INFLUENCE_DIST = 180;
    const MOUSE_INFLUENCE_DIST_SQ =
      MOUSE_INFLUENCE_DIST * MOUSE_INFLUENCE_DIST;

    let rafId = 0;

    const step = () => {
      ctx.clearRect(0, 0, width, height);

      // Update
      for (const p of particles) {
        if (!prefersReducedMotion) {
          p.x += p.vx;
          p.y += p.vy;

          // Cursor push (gentle)
          if (mouse.active) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < MOUSE_INFLUENCE_DIST_SQ && dSq > 1) {
              const d = Math.sqrt(dSq);
              const force = (1 - d / MOUSE_INFLUENCE_DIST) * 0.6;
              p.x += (dx / d) * force;
              p.y += (dy / d) * force;
            }
          }

          // Wrap edges
          if (p.x < -10) p.x = width + 10;
          else if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          else if (p.y > height + 10) p.y = -10;
        }
      }

      // Draw connections first so dots sit on top
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < CONNECT_DIST_SQ) {
            const alpha = (1 - dSq / CONNECT_DIST_SQ) * 0.45;
            ctx.strokeStyle = `rgba(255, 138, 76, ${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw dots
      for (const p of particles) {
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, 0.85)`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Glow pass near mouse
      if (mouse.active && !prefersReducedMotion) {
        const gradient = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          240,
        );
        gradient.addColorStop(0, "rgba(255, 138, 76, 0.15)");
        gradient.addColorStop(1, "rgba(255, 138, 76, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(mouse.x - 240, mouse.y - 240, 480, 480);
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(step);
      }
    };

    step();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(ellipse at 50% 30%, #1a1512 0%, #0c0908 60%, #050403 100%)",
        color: "#f5f0ea",
      }}
    >
      {/* Canvas particle network */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
        }}
      />

      {/* Subtle vignette + scanline-style gradient overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.35) 85%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Fade-in keyframes + styles */}
      <style>{`
        @keyframes pt-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pt-pulse-dot {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.4); }
        }
        @keyframes pt-glow {
          0%, 100% { filter: drop-shadow(0 0 14px rgba(255, 138, 76, 0.35)); }
          50%      { filter: drop-shadow(0 0 28px rgba(255, 138, 76, 0.55)); }
        }
        .pt-rise-1 { animation: pt-rise 0.9s ease-out 0.15s both; }
        .pt-rise-2 { animation: pt-rise 0.9s ease-out 0.35s both; }
        .pt-rise-3 { animation: pt-rise 0.9s ease-out 0.55s both; }
        .pt-rise-4 { animation: pt-rise 0.9s ease-out 0.75s both; }
        .pt-rise-5 { animation: pt-rise 0.9s ease-out 0.95s both; }
        .pt-logo-glow { animation: pt-glow 4s ease-in-out infinite; }
        .pt-status-dot { animation: pt-pulse-dot 2s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .pt-rise-1, .pt-rise-2, .pt-rise-3, .pt-rise-4, .pt-rise-5,
          .pt-logo-glow, .pt-status-dot {
            animation: none !important;
          }
        }

        .pt-admin-link {
          color: rgba(245, 240, 234, 0.55);
          text-decoration: none;
          transition: color 0.2s ease, transform 0.2s ease;
          font-size: 0.82rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-weight: 600;
        }
        .pt-admin-link:hover {
          color: #FF8A4C;
          transform: translateX(2px);
        }
        .pt-hairline {
          width: 60px;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 138, 76, 0.6),
            transparent
          );
        }
      `}</style>

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
          zIndex: 2,
          textAlign: "center",
        }}
      >
        <div className="pt-rise-1 pt-logo-glow" style={{ marginBottom: 32 }}>
          <Image
            src="/images/peachlogo2-remove-bg-io.png"
            alt="PeachTracker"
            width={120}
            height={120}
            priority
            style={{
              height: "auto",
              width: "clamp(84px, 14vw, 120px)",
            }}
          />
        </div>

        <div
          className="pt-rise-2"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <div className="pt-hairline" />
          <p
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.32em",
              color: "#FF8A4C",
              margin: 0,
            }}
          >
            Scheduled Maintenance
          </p>
          <div className="pt-hairline" />
        </div>

        <h1
          className="pt-rise-3"
          style={{
            fontWeight: 800,
            fontSize: "clamp(2.5rem, 6.5vw, 4.5rem)",
            letterSpacing: "-0.035em",
            lineHeight: 1.02,
            marginBottom: 24,
            maxWidth: "18ch",
            color: "#f5f0ea",
          }}
        >
          We&rsquo;ll be back shortly.
        </h1>

        <p
          className="pt-rise-4"
          style={{
            fontSize: "clamp(1.05rem, 1.6vw, 1.2rem)",
            lineHeight: 1.55,
            color: "rgba(245, 240, 234, 0.72)",
            maxWidth: "52ch",
            fontWeight: 400,
            margin: 0,
          }}
        >
          PeachTracker is undergoing scheduled maintenance ahead of relaunch.
          Our civic accountability platform for Macon-Bibb County will return
          soon.
        </p>

        <div
          className="pt-rise-5"
          style={{
            marginTop: 44,
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 18px",
            borderRadius: 999,
            background: "rgba(255, 138, 76, 0.08)",
            border: "1px solid rgba(255, 138, 76, 0.25)",
            fontSize: "0.88rem",
            color: "rgba(245, 240, 234, 0.85)",
            letterSpacing: "0.01em",
          }}
        >
          <span
            className="pt-status-dot"
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#FF8A4C",
              boxShadow: "0 0 12px rgba(255, 138, 76, 0.8)",
              display: "inline-block",
            }}
          />
          System status: Maintenance in progress
        </div>
      </div>

      {/* Footer with admin bypass */}
      <footer
        style={{
          position: "relative",
          zIndex: 2,
          padding: "24px 24px 32px",
          textAlign: "center",
          borderTop: "1px solid rgba(255, 240, 230, 0.06)",
          background: "rgba(12, 9, 8, 0.4)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <Link href="/admin/login" className="pt-admin-link">
          Administrator Sign In →
        </Link>
      </footer>
    </main>
  );
}
