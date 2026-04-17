// Temporary diagnostic. DELETE this file once CRON_SECRET is confirmed working.
//
// It tells us:
//   - whether CRON_SECRET is set in this deployment's env at all
//   - its length (so we can spot trailing whitespace / wrong copy-paste)
//   - a short hash of the server-side value
//   - whether the ?key= we sent matches
// No raw secret is ever returned.

import { NextResponse } from "next/server";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

function fp(s: string | undefined | null): string | null {
  if (!s) return null;
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const keyParam = url.searchParams.get("key");
  const server = process.env.CRON_SECRET;

  return NextResponse.json({
    server: {
      isSet: typeof server === "string" && server.length > 0,
      length: server?.length ?? 0,
      fingerprint: fp(server),
    },
    client: {
      lengthSent: keyParam?.length ?? 0,
      fingerprint: fp(keyParam),
    },
    matches: !!server && keyParam === server,
    deployedAt: new Date().toISOString(),
  });
}
