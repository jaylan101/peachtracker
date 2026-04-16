import type { Metadata } from "next";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import { MulberryAskPage } from "@/components/mulberry-fullpage";

export const metadata: Metadata = {
  title: "Ask Mulberry — Macon-Bibb Civic Guide · PeachTracker",
  description:
    "Ask Mulberry anything about Macon-Bibb County — elections, commissioners, voting locations, local government, and more.",
};

export default function AskPage() {
  return (
    <MulberryAskPage />
  );
}
