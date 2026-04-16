import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for the Census Geocoder.
 * The Census API doesn't set CORS headers, so we proxy through our own API route.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address param required" }, { status: 400 });
  }

  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Geocoder request failed" }, { status: 502 });
  }
}
