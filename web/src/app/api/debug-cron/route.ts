// Disabled. The diagnostic served its purpose; returning 410 Gone.
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ error: "Gone" }, { status: 410 });
}
