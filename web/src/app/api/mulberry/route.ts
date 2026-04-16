import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Mulberry API Route ────────────────────────────────────────────────────────
// RAG pipeline:
//   1. Embed the question using Cloudflare BGE-small (384 dims)
//   2. Vector similarity search via match_knowledge_chunks (pgvector)
//   3. Pass top chunks as context to Cloudflare Gemma 4 26B
//   4. Return a grounded natural language answer
//
// Fallback: if embedding fails, uses IDF keyword search
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN   = process.env.CF_API_TOKEN;
const CF_LLM_MODEL   = "@cf/google/gemma-4-26b-a4b-it";
const CF_EMBED_MODEL = "@cf/baai/bge-small-en-v1.5";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── Embedding ────────────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[] | null> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_EMBED_MODEL}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vector: number[] = data?.result?.data?.[0];
    return vector?.length === 384 ? vector : null;
  } catch {
    return null;
  }
}

// ── Vector search (primary) ──────────────────────────────────────────────────

async function vectorSearch(queryEmbedding: number[]): Promise<string[]> {
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: 0.2,
    match_count: 5,
  });
  if (error || !data) return [];
  return (data as Array<{ content: string; similarity: number }>)
    .map((r) => r.content);
}

// ── Keyword search (fallback) ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","and","for","are","was","were","has","have","had","this","that","with",
  "from","they","them","their","what","when","where","who","how","can","will",
  "about","which","there","been","more","also","into","than","then","some",
  "would","could","should","does","did","not","but","you","your","its","our",
  "tell","me","is","in","of","to","a","an","do","on","at","by","be","it",
]);

async function keywordSearch(query: string): Promise<string[]> {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  if (words.length === 0) return [];

  const ilikeConditions = words.map((w) => `content.ilike.%${w}%`).join(",");
  const { data: rows } = await supabase
    .from("knowledge_chunks")
    .select("content, chunk_id")
    .or(ilikeConditions)
    .limit(20);

  if (!rows?.length) return [];

  const totalDocs = rows.length;
  const wordDocFreq: Record<string, number> = {};
  for (const word of words) {
    wordDocFreq[word] = rows.filter((r) => r.content.toLowerCase().includes(word)).length;
  }

  return rows
    .map((row) => {
      const lower = row.content.toLowerCase();
      let score = 0;
      let matchCount = 0;
      for (const word of words) {
        if (lower.includes(word)) {
          score += Math.log(totalDocs / (wordDocFreq[word] ?? 1) + 1);
          matchCount++;
        }
      }
      return { content: row.content, score, matchCount };
    })
    .filter((r) => r.matchCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((r) => r.content);
}

// ── LLM call ─────────────────────────────────────────────────────────────────

async function askGemma(question: string, context: string): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_LLM_MODEL}`;

  const systemPrompt =
    "You are Mulberry, a civic AI assistant built into PeachTracker (peachtracker.vercel.app), " +
    "a civic tracker for Macon-Bibb County, Georgia. " +
    "Answer questions about local elections, commissioners, voting, and civic facts. " +
    "Keep answers concise (2-4 sentences), factual, and friendly. " +
    "Use ONLY the information in the CONTEXT below to answer. " +
    "IMPORTANT: Distinguish carefully between 'mayor' and 'mayor pro tem' — these are different roles. " +
    "The mayor is the chief executive of Macon-Bibb County (currently Lester Miller). " +
    "The mayor pro tem is a commissioner elected by the commission to lead meetings in the mayor's absence (currently Valerie Wynn). " +
    "If someone asks 'who is the mayor', answer about the mayor (Lester Miller), not the mayor pro tem. " +
    "If the context contains information unrelated to the question, ignore it. " +
    "If the context does not contain enough information to answer, say so honestly " +
    "and point to a relevant resource.\n" +
    "When relevant, link to:\n" +
    "- Elections & races: peachtracker.vercel.app/elections\n" +
    "- Commission districts & members: peachtracker.vercel.app/commission\n" +
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
    throw new Error(`Cloudflare AI error: ${res.status}`);
  }

  const data = await res.json();
  const reply = data?.result?.response?.trim();
  if (!reply) throw new Error("Empty reply from Cloudflare AI");
  return reply;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await req.json();
    if (!messages?.length) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const question = messages[messages.length - 1]?.content ?? "";
    console.log("[mulberry] question:", question);

    // 1. Try vector search first (semantic, typo-tolerant, meaning-aware)
    let chunks: string[] = [];
    const embedding = await embedText(question);

    if (embedding) {
      chunks = await vectorSearch(embedding);
      console.log("[mulberry] vector search chunks:", chunks.length);
    }

    // 2. Fall back to keyword search if vector search returned nothing
    if (chunks.length === 0) {
      chunks = await keywordSearch(question);
      console.log("[mulberry] keyword fallback chunks:", chunks.length);
    }

    // 3. Re-order chunks so the most directly relevant one appears last
    //    (LLMs tend to anchor on the final context items)
    if (chunks.length > 1) {
      const q = question.toLowerCase();
      const isMayorQuery = /\bmayor\b/.test(q) && !/pro.?tem\b/.test(q);
      if (isMayorQuery) {
        // Find the chunk that names Lester Miller and put it last
        const millerIdx = chunks.findIndex((c) =>
          /lester miller/i.test(c) || /current mayor/i.test(c)
        );
        if (millerIdx > 0) {
          const [millerChunk] = chunks.splice(millerIdx, 1);
          chunks.push(millerChunk);
        }
      }
    }

    // 4. Call Gemma with context (or without if no chunks found)
    if (CF_ACCOUNT_ID && CF_API_TOKEN) {
      const context = chunks.length > 0
        ? chunks.join("\n\n---\n\n")
        : "No specific data was found in the PeachTracker database for this question.";

      try {
        const reply = await askGemma(question, context);
        return NextResponse.json({ reply });
      } catch (aiErr) {
        console.error("[mulberry] Gemma call failed:", aiErr);
      }
    }

    // 5. Static fallback
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
