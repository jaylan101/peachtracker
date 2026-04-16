import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Mulberry API Route ────────────────────────────────────────────────────────
// RAG pipeline:
//   1. Keyword search with IDF-style weighting (rare words score higher)
//   2. Trigram fallback for typos / unmatched words
//   3. Top chunks passed as context to Cloudflare Workers AI (Gemma 4 26B)
//   4. Gemma reasons over the context and returns a grounded answer
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_MODEL      = "@cf/google/gemma-4-26b-a4b-it";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STOP_WORDS = new Set([
  "the","and","for","are","was","were","has","have","had","this","that","with",
  "from","they","them","their","what","when","where","who","how","can","will",
  "about","which","there","been","more","also","into","than","then","some",
  "would","could","should","does","did","not","but","you","your","its","our",
  "tell","me","is","in","of","to","a","an","do","on","at","by","be","it",
  "candidates","candidate","running","current","county","macon","bibb",
]);

function extractWords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

async function searchKnowledge(query: string): Promise<string[]> {
  const words = extractWords(query);
  // Also keep original words (before stop-word filtering) for phrase matching
  const rawWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const searchWords = words.length > 0 ? words : rawWords.filter(w => w.length >= 3);
  if (searchWords.length === 0) return [];

  // Fetch ALL chunks that match any query word
  const ilikeConditions = searchWords
    .map((w) => `content.ilike.%${w}%`)
    .join(",");

  const { data: rows } = await supabase
    .from("knowledge_chunks")
    .select("content, category, chunk_id")
    .or(ilikeConditions)
    .limit(30);

  if (!rows || rows.length === 0) {
    // Typo fallback: try trigram similarity
    const { data: trgmData } = await supabase
      .rpc("search_knowledge_trgm", { query_words: searchWords, match_limit: 8 })
      .catch(() => ({ data: null }));
    return ((trgmData as Array<{ content: string }>) ?? [])
      .slice(0, 3)
      .map((r) => r.content);
  }

  // IDF-style scoring: count how many chunks each word appears in
  // Words that appear in fewer chunks are more specific and worth more
  const wordDocFreq: Record<string, number> = {};
  for (const word of searchWords) {
    wordDocFreq[word] = rows.filter((r) =>
      r.content.toLowerCase().includes(word)
    ).length;
  }

  const totalDocs = rows.length;

  const scored = rows.map((row) => {
    const lower = row.content.toLowerCase();

    let score = 0;
    for (const word of searchWords) {
      if (lower.includes(word)) {
        // IDF: words that appear in fewer docs are worth more
        const df = wordDocFreq[word] ?? 1;
        const idf = Math.log(totalDocs / df + 1);
        score += idf;
      }
    }

    // Bonus: how many distinct query words matched (breadth of match)
    const matchedCount = searchWords.filter((w) => lower.includes(w)).length;
    score += matchedCount * 0.5;

    return { content: row.content, chunk_id: row.chunk_id, score, matchedCount };
  });

  const results = scored
    .filter((r) => r.matchedCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((r) => r.content);

  // If we got fewer than 2 results, also try trigram for typo coverage
  if (results.length < 2) {
    const { data: trgmData } = await supabase
      .rpc("search_knowledge_trgm", { query_words: searchWords, match_limit: 6 })
      .catch(() => ({ data: null }));

    const existingIds = new Set(scored.slice(0, 4).map((r) => r.chunk_id));
    const extra = ((trgmData as Array<{ chunk_id: string; content: string }>) ?? [])
      .filter((r) => !existingIds.has(r.chunk_id))
      .slice(0, 2)
      .map((r) => r.content);

    return [...results, ...extra].slice(0, 4);
  }

  return results;
}

async function askCloudflareAI(question: string, context: string): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;

  const systemPrompt =
    "You are Mulberry, a civic AI assistant built into PeachTracker (peachtracker.vercel.app), " +
    "a civic tracker for Macon-Bibb County, Georgia. " +
    "Answer questions about local elections, commissioners, voting, and civic facts. " +
    "Keep answers concise (2-4 sentences), factual, and friendly. " +
    "Use ONLY the information in the CONTEXT below to answer. " +
    "If the context contains information unrelated to the question, ignore it. " +
    "If the context does not contain enough information to answer, say so honestly " +
    "and point to a relevant resource.\n" +
    "When relevant, point users to PeachTracker pages:\n" +
    "- Elections & races: peachtracker.vercel.app/elections\n" +
    "- Commission districts & members: peachtracker.vercel.app/commission\n" +
    "- Ask Mulberry (full page): peachtracker.vercel.app/ask\n" +
    "- Georgia My Voter Page: mvp.sos.ga.gov (polling location, sample ballot)\n" +
    "- Bibb County Board of Elections: maconbibb.us/board-of-elections or (478) 621-6622\n\n" +
    "CONTEXT:\n" + context;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: question },
      ],
      max_tokens: 300,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[mulberry] Cloudflare AI error: ${res.status}`, errText);
    throw new Error(`Cloudflare AI error: ${res.status}`);
  }

  const data = await res.json();
  const reply = data?.result?.response?.trim();
  if (!reply) {
    console.error("[mulberry] Unexpected CF response:", JSON.stringify(data).slice(0, 400));
    throw new Error("Empty reply from Cloudflare AI");
  }
  return reply;
}

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await req.json();
    if (!messages?.length) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const question = messages[messages.length - 1]?.content ?? "";
    console.log("[mulberry] question:", question);

    const chunks = await searchKnowledge(question);
    console.log("[mulberry] chunks found:", chunks.length, chunks.map(c => c.slice(0, 60)));

    if (CF_ACCOUNT_ID && CF_API_TOKEN) {
      const context = chunks.length > 0
        ? chunks.join("\n\n---\n\n")
        : "No specific data was found in the PeachTracker database for this question.";

      try {
        const reply = await askCloudflareAI(question, context);
        return NextResponse.json({ reply });
      } catch (aiErr) {
        console.error("[mulberry] AI call failed:", aiErr);
      }
    }

    // Static fallback
    if (chunks.length === 0) {
      return NextResponse.json({
        reply:
          "I don't have specific information about that yet. " +
          "Check the Bibb County Board of Elections at maconbibb.us/board-of-elections " +
          "or call (478) 621-6622. You can also visit mvp.sos.ga.gov for your ballot and polling place.",
      });
    }

    return NextResponse.json({ reply: chunks[0] });
  } catch (err) {
    console.error("[mulberry] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
