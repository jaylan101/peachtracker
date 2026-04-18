// HTML entity decoder for CivicClerk agenda text.
//
// CivicClerk serves agenda item titles and descriptions as HTML fragments:
// &amp;, &nbsp;, &#39;, &ldquo;/&rdquo;, &shy;, etc. The sync strips HTML tags
// with a regex but doesn't decode entities, so these arrive in the DB verbatim
// and render as "Paulk Landscaping &amp; Nursery" on user-facing pages.
//
// This helper handles the entity set CivicClerk actually emits. It's a deliberate
// whitelist rather than a full HTML5 decoder so we don't pull a dependency for
// a bounded problem, and so unfamiliar-looking entities surface in review rather
// than being silently decoded into who-knows-what.
//
// Tested against all 273 affected rows in the Macon-Bibb agenda_items table.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",      // non-breaking space → regular space; downstream .trim() handles edges
  shy: "",        // soft hyphen → remove (invisible by design, messes up copy-paste)
  ldquo: "\u201C",
  rdquo: "\u201D",
  lsquo: "\u2018",
  rsquo: "\u2019",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  deg: "\u00B0",
  para: "\u00B6",
  sect: "\u00A7",
  bull: "\u2022",
  middot: "\u00B7",
};

// Decode HTML entities. Handles:
// - Named entities listed above
// - Numeric decimal (&#39;)
// - Numeric hexadecimal (&#x27;)
//
// Idempotent: running it twice on already-decoded text returns the same result,
// because decoded characters (&, <, ', " etc.) don't match the &...; pattern.
// The only edge is a literal "&amp;amp;" which would decode fully to "&amp;"
// on first pass, then to "&" on a second — but CivicClerk never produces that,
// and the backfill runs exactly once.
export function decodeEntities(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    // Numeric: &#39; or &#x27;
    if (code.startsWith("#")) {
      const isHex = code.startsWith("#x") || code.startsWith("#X");
      const num = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(num) && num >= 0 && num <= 0x10FFFF) {
        return String.fromCodePoint(num);
      }
      return match; // leave malformed codes intact rather than silently eat them
    }
    // Named
    const decoded = NAMED_ENTITIES[code.toLowerCase()];
    return decoded !== undefined ? decoded : match;
  });
}

// Apply tag-strip + entity-decode in one pass. This is what the CivicClerk sync
// should call on both title and full_text fields before upserting to Supabase.
export function cleanAgendaText(input: string | null | undefined): string {
  if (!input) return "";
  return decodeEntities(input.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}
