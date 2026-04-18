import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { MulberryChat } from "@/components/mulberry-chat";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-outfit",
  display: "swap",
});

const BASE_URL = "https://peachtracker.vercel.app";

// Mobile viewport. Without this, mobile browsers render at ~980px CSS width
// and scale down, which makes text look clipped/overflowing on narrow phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "PeachTracker — Macon-Bibb civic tracker",
  description:
    "Live election results, commission votes, and civic news for Macon-Bibb County, Georgia.",
  openGraph: {
    title: "PeachTracker — Macon-Bibb civic tracker",
    description:
      "Live election results for Macon-Bibb County, Georgia, reported by the community.",
    url: BASE_URL,
    siteName: "PeachTracker",
    images: [{ url: `${BASE_URL}/api/og`, width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PeachTracker — Macon-Bibb civic tracker",
    description:
      "Live election results for Macon-Bibb County, Georgia, reported by the community.",
    images: [`${BASE_URL}/api/og`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="font-sans">
        {children}
        <MulberryChat />
        <Analytics />
      </body>
    </html>
  );
}
