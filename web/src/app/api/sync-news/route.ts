// Weekly commissioner news sync.
//
// Source: Google News RSS (no API key needed). We scope each query to the
// commissioner's name PLUS a geo keyword (Macon / Bibb / commissioner /
// Macon-Bibb) so we don't pick up same-name people in other states.
//
// Auto-approve policy:
//   - Title OR snippet must contain the commissioner's last name
//   - AND at least one geo keyword must appear in title/snippet
//   If both pass, the row is written with hidden=false. Otherwise hidden=true
//   with a reason, so it's still in the DB (visible in admin) but not public.
//
// Auth: Vercel Cron sends a Bearer token matching CRON_SECRET. The route also
// accepts an admin-authenticated call (service-role key not required) for
// manual triggering from /admin.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Local loose type — the generated DB types don't yet include commissioner_news.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupa = SupabaseClient<any, any, any>;

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const GEO_KEYWORDS = [
  "macon",
  "bibb",
  "commissioner",
  "commission",
  "georgia",
  "ga",
];

interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  source: string | null;
  snippet: string | null;
}

// Minimal RSS parser — Google News RSS is a simple <item> list with
// <title>, <link>, <pubDate>, <source>, <description>. Avoids an xml2js dep.
function parseGoogleNewsRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = extract(block, "title");
    const link = extract(block, "link");
    const pubDate = extract(block, "pubDate");
    const source = extractAttr(block, "source");
    const description = extract(block, "description");
    // Google News wraps descriptions in CDATA containing ENTITY-ENCODED HTML
    // (e.g. "&lt;a href=...&gt;Title&lt;/a&gt;"). We have to decode entities
    // before stripping tags — otherwise the stripper sees plain text and
    // leaves the encoded markup as-is.
    const snippet = description
      ? stripHtml(decodeHtml(description)).trim()
      : null;
    if (title && link) {
      items.push({
        title: decodeHtml(title).trim(),
        link: link.trim(),
        pubDate: pubDate?.trim() ?? null,
        source: source ? decodeHtml(source).trim() : null,
        snippet: snippet && snippet.length > 0 ? snippet : null,
      });
    }
  }
  return items;
}

function extract(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const m = block.match(re);
  if (!m) return null;
  const raw = m[1];
  // Strip CDATA wrapper if present
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : raw;
}

function extractAttr(block: string, tag: string): string | null {
  // <source url="...">Name</source>
  const re = new RegExp(`<${tag}\\s[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = block.match(re);
  return m ? m[1] : null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

// Decide whether an item is relevant to this specific commissioner. The goal
// is to filter out same-name people in other places without being so strict
// that we miss legitimate local coverage.
function isRelevant(item: RssItem, lastName: string): { ok: boolean; reason?: string } {
  const haystack = `${item.title} ${item.snippet ?? ""}`.toLowerCase();
  const last = lastName.toLowerCase();
  if (!haystack.includes(last)) {
    return { ok: false, reason: "name not in title/snippet" };
  }
  const hasGeo = GEO_KEYWORDS.some((kw) => haystack.includes(kw));
  if (!hasGeo) {
    return { ok: false, reason: "no geo keyword (macon/bibb/etc)" };
  }
  return { ok: true };
}

async function syncForCommissioner(
  supabase: AnySupa,
  c: { id: string; name: string; district: string },
): Promise<{ fetched: number; inserted: number; hidden: number }> {
  // Scope the query so Google doesn't hand us Joey Hulett the truck salesman in TN.
  const query = `"${c.name}" (Macon OR Bibb OR commissioner)`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  const r = await fetch(url, {
    headers: { Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
  });
  if (!r.ok) {
    return { fetched: 0, inserted: 0, hidden: 0 };
  }
  const xml = await r.text();
  const items = parseGoogleNewsRss(xml);
  const lastName = c.name.split(" ").slice(-1)[0];

  let inserted = 0;
  let hidden = 0;
  for (const item of items.slice(0, 25)) {
    const rel = isRelevant(item, lastName);
    const published_at = item.pubDate ? new Date(item.pubDate).toISOString() : null;
    const { error } = await supabase.from("commissioner_news").upsert(
      {
        commissioner_id: c.id,
        source_url: item.link,
        source_name: item.source,
        title: item.title.slice(0, 500),
        snippet: item.snippet?.slice(0, 1000) ?? null,
        published_at,
        hidden: !rel.ok,
        hidden_reason: rel.reason ?? null,
      },
      { onConflict: "commissioner_id,source_url", ignoreDuplicates: true },
    );
    if (!error) {
      inserted++;
      if (!rel.ok) hidden++;
    }
  }
  return { fetched: items.length, inserted, hidden };
}

export async function GET(request: Request) {
  // Accept either Vercel Cron bearer OR ?key= matching CRON_SECRET for manual triggers.
  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const keyParam = url.searchParams.get("key");
  const expected = process.env.CRON_SECRET;
  const ok =
    expected &&
    (authHeader === `Bearer ${expected}` || keyParam === expected);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase: AnySupa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: commissioners } = await supabase
    .from("commissioners")
    .select("id, name, district")
    .eq("active", true);

  const results: Array<{ name: string; fetched: number; inserted: number; hidden: number }> = [];
  for (const c of (commissioners ?? []) as Array<{ id: string; name: string; district: string }>) {
    const r = await syncForCommissioner(supabase, c);
    results.push({ name: c.name, ...r });
    // Polite pause so Google News doesn't rate-limit us.
    await new Promise((res) => setTimeout(res, 600));
  }

  const totals = results.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.fetched,
      inserted: acc.inserted + r.inserted,
      hidden: acc.hidden + r.hidden,
    }),
    { fetched: 0, inserted: 0, hidden: 0 },
  );

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    totals,
    perCommissioner: results,
  });
}
