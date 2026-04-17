"use client";

// PeachTracker maintenance splash — warm, on-brand, animated with motion.dev.
//
// Visual concept:
// - Cream background with soft peach gradient wash (on-brand, not dark)
// - 14 SVG peaches drifting gently across the viewport at varied speeds,
//   sizes, and depths — the "orchard on a breezy day" feel
// - Headline + kicker + subtitle choreographed with staggered spring entrance
// - Logo breathes with a subtle scale + glow pulse
// - Pulsing status pill with peach dot
//
// Everything respects prefers-reduced-motion.

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";

// A simple peach SVG. Tweakable via color/size. Leaf + highlight for depth.
function PeachSVG({ size = 48, color = "#E0956E" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* leaf */}
      <path
        d="M34 10 C 40 6, 48 8, 48 14 C 44 16, 38 16, 34 12 Z"
        fill="#6FCF97"
        opacity="0.85"
      />
      {/* leaf highlight */}
      <path
        d="M38 10 C 42 8, 46 10, 46 13"
        stroke="#A8E4BF"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
      {/* peach body */}
      <path
        d="M32 14 C 18 14, 10 26, 10 38 C 10 52, 22 58, 32 58 C 42 58, 54 52, 54 38 C 54 26, 46 14, 32 14 Z"
        fill={color}
      />
      {/* cleft */}
      <path
        d="M32 16 C 30 26, 30 46, 32 56"
        stroke="#E5693A"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
      {/* highlight */}
      <ellipse
        cx="22"
        cy="28"
        rx="6"
        ry="8"
        fill="#FFCBA4"
        opacity="0.55"
        transform="rotate(-20 22 28)"
      />
    </svg>
  );
}

type PeachConfig = {
  size: number;
  startX: number; // %
  startY: number; // %
  drift: number; // px horizontal drift
  rise: number; // px vertical drift (negative = up)
  rotate: number; // degrees
  duration: number; // seconds
  delay: number; // seconds
  opacity: number;
  color: string;
};

function generatePeaches(): PeachConfig[] {
  // Deterministic enough to look curated but varied. We pre-define positions
  // instead of Math.random at render so SSR/CSR match.
  return [
    { size: 64,  startX: 8,   startY: 20,  drift: 40,  rise: -60, rotate: 25,  duration: 18, delay: 0,   opacity: 0.55, color: "#E0956E" },
    { size: 42,  startX: 18,  startY: 72,  drift: -30, rise: -40, rotate: -20, duration: 22, delay: 1.5, opacity: 0.40, color: "#E8A784" },
    { size: 88,  startX: 85,  startY: 15,  drift: -50, rise: 70,  rotate: -30, duration: 24, delay: 0.8, opacity: 0.35, color: "#D08559" },
    { size: 36,  startX: 70,  startY: 85,  drift: 60,  rise: -90, rotate: 40,  duration: 20, delay: 2.2, opacity: 0.50, color: "#E0956E" },
    { size: 56,  startX: 45,  startY: 10,  drift: 30,  rise: 50,  rotate: 15,  duration: 26, delay: 1.2, opacity: 0.30, color: "#E8A784" },
    { size: 72,  startX: 92,  startY: 60,  drift: -70, rise: -50, rotate: -35, duration: 28, delay: 0.3, opacity: 0.40, color: "#D08559" },
    { size: 30,  startX: 55,  startY: 55,  drift: 50,  rise: -70, rotate: 60,  duration: 16, delay: 3,   opacity: 0.55, color: "#E0956E" },
    { size: 48,  startX: 30,  startY: 35,  drift: -40, rise: 60,  rotate: -25, duration: 21, delay: 1.8, opacity: 0.45, color: "#E8A784" },
    { size: 38,  startX: 78,  startY: 35,  drift: 30,  rise: 80,  rotate: 20,  duration: 23, delay: 0.6, opacity: 0.40, color: "#E0956E" },
    { size: 96,  startX: 5,   startY: 80,  drift: 80,  rise: -80, rotate: -45, duration: 30, delay: 2.5, opacity: 0.28, color: "#D08559" },
    { size: 34,  startX: 62,  startY: 75,  drift: -40, rise: -100, rotate: 30, duration: 19, delay: 1.1, opacity: 0.50, color: "#E8A784" },
    { size: 52,  startX: 12,  startY: 50,  drift: 70,  rise: 40,  rotate: -15, duration: 25, delay: 0.9, opacity: 0.40, color: "#E0956E" },
    { size: 44,  startX: 88,  startY: 88,  drift: -60, rise: -60, rotate: 35,  duration: 22, delay: 2.8, opacity: 0.45, color: "#D08559" },
    { size: 28,  startX: 40,  startY: 90,  drift: 40,  rise: -120, rotate: 50, duration: 17, delay: 0.4, opacity: 0.55, color: "#E0956E" },
  ];
}

export function MaintenanceSplash() {
  const reduced = useReducedMotion();
  const peaches = useMemo(generatePeaches, []);

  return (
    <main
      style={{
        // Pin to viewport; prevent scroll bleed on mobile when the address
        // bar toggles. Uses both svh (small viewport height) minimum and dvh
        // for dynamic adjustment — whichever the browser supports.
        position: "fixed",
        inset: 0,
        minHeight: "100svh",
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        overscrollBehavior: "none",
        background:
          "radial-gradient(ellipse at 50% 20%, #FDF0E8 0%, #FFFBF5 55%, #FDF5EB 100%)",
        color: "#1a1a1a",
      }}
    >
      {/* Lock the document — no scroll bleed on mobile */}
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          height: 100%;
          overscroll-behavior: none;
          background: #FFFBF5;
        }
      `}</style>

      {/* Top accent bar — matches the rest of the site */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          zIndex: 3,
          height: 5,
          background: "#E0956E",
          flexShrink: 0,
        }}
      />
      {/* Floating peaches — behind content */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        {peaches.map((p, i) => (
          <motion.div
            key={i}
            initial={{
              x: 0,
              y: 0,
              rotate: 0,
              opacity: 0,
            }}
            animate={
              reduced
                ? { opacity: p.opacity }
                : {
                    x: [0, p.drift, 0],
                    y: [0, p.rise, 0],
                    rotate: [0, p.rotate, 0],
                    opacity: [0, p.opacity, p.opacity, 0],
                  }
            }
            transition={
              reduced
                ? { duration: 0.5 }
                : {
                    duration: p.duration,
                    delay: p.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.3, 0.7, 1],
                  }
            }
            style={{
              position: "absolute",
              left: `${p.startX}%`,
              top: `${p.startY}%`,
              filter: "drop-shadow(0 6px 14px rgba(224, 149, 110, 0.18))",
              willChange: "transform",
            }}
          >
            <PeachSVG size={p.size} color={p.color} />
          </motion.div>
        ))}
      </div>

      {/* Soft light wash for center focus */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(255,251,245,0.55) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

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
        {/* Logo with breathing glow */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          style={{ marginBottom: 32 }}
        >
          <motion.div
            animate={
              reduced
                ? {}
                : {
                    scale: [1, 1.03, 1],
                    filter: [
                      "drop-shadow(0 0 0px rgba(224, 149, 110, 0.0))",
                      "drop-shadow(0 0 24px rgba(224, 149, 110, 0.35))",
                      "drop-shadow(0 0 0px rgba(224, 149, 110, 0.0))",
                    ],
                  }
            }
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Image
              src="/images/peachlogo2-remove-bg-io.png"
              alt="PeachTracker"
              width={128}
              height={128}
              priority
              style={{
                height: "auto",
                width: "clamp(96px, 15vw, 128px)",
              }}
            />
          </motion.div>
        </motion.div>

        {/* Kicker — matches site style: tiny caps, peach, with peach underline */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          style={{
            fontSize: "0.68rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "#E0956E",
            margin: "0 0 20px",
            paddingBottom: 10,
            borderBottom: "2px solid #E0956E",
          }}
        >
          Scheduled Maintenance
        </motion.p>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: "easeOut" }}
          style={{
            fontWeight: 800,
            fontSize: "clamp(2.5rem, 6.5vw, 4.5rem)",
            letterSpacing: "-0.035em",
            lineHeight: 1.02,
            marginBottom: 24,
            maxWidth: "18ch",
            color: "#1a1a1a",
          }}
        >
          We&rsquo;ll be back shortly.
        </motion.h1>

        {/* Subtitle — what PeachTracker is, without giving it all away */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: "easeOut" }}
          style={{
            fontSize: "clamp(1.05rem, 1.6vw, 1.2rem)",
            lineHeight: 1.55,
            color: "#4a4a4a",
            maxWidth: "52ch",
            fontWeight: 400,
            margin: 0,
          }}
        >
          An independent civic tracker for Macon-Bibb County, Georgia.
        </motion.p>
      </div>

      {/* Footer with admin bypass — matches site footer chrome */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1, ease: "easeOut" }}
        style={{
          position: "relative",
          zIndex: 2,
          padding: "20px 24px 24px",
          textAlign: "center",
          borderTop: "1px solid rgba(0, 0, 0, 0.08)",
          background: "rgba(255, 251, 245, 0.7)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          fontSize: "0.68rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        <Link
          href="/admin/login"
          className="pt-admin-link"
          style={{
            color: "#8a8a8a",
            textDecoration: "none",
            transition: "color 0.15s ease",
            display: "inline-block",
            borderBottom: "2px solid transparent",
            paddingBottom: 2,
          }}
        >
          Administrator Sign In →
        </Link>
        <style>{`
          .pt-admin-link:hover {
            color: #E0956E !important;
            border-bottom-color: #E0956E !important;
          }
        `}</style>
      </motion.footer>
    </main>
  );
}
