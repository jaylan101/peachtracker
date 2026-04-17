// Branded maintenance / coming-soon splash. Shown to all non-admin visitors
// when MAINTENANCE_MODE=true in Vercel. Admins who are signed in bypass this
// via the middleware check.
//
// The actual visual lives in <MaintenanceSplash /> (client component) because
// we need a <canvas> particle animation that runs in the browser.

import type { Metadata } from "next";
import { MaintenanceSplash } from "@/components/maintenance-splash";

export const metadata: Metadata = {
  title: "PeachTracker — Back Soon",
  description:
    "PeachTracker is undergoing scheduled maintenance ahead of relaunch. Civic accountability for Macon-Bibb County.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function MaintenancePage() {
  return <MaintenanceSplash />;
}
