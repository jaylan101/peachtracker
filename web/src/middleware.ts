import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets and images
    "/((?!_next/static|_next/image|favicon.ico|images/|candidates/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mov|mp4)$).*)",
  ],
};
