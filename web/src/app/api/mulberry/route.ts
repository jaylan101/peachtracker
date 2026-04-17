import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Mulberry API Route ────────────────────────────────────────────────────────
// RAG pipeline:
//   1. Embed the user's question with Cloudflare BGE-small (384 dims).
//   2. Pull candidate_pool=10 chunks from Supabase via pgvector similarity.
//   3. Re-rank those with Cloudflare BGE-reranker-base — much better at
//      telling "procedural voting rules" apart from "a 2012 referendum
//      that used the word 'vote'" than a bi-encoder alone.
//   4. Keep top_k=3 and send them to Gemma 4 26B as context.
//
// Fallback if embedding or reranking fails: IDF keyword search.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CF_ACCOUNT_ID   = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN    = process.env.CF_API_TOKEN;
const CF_LLM_MODEL    = "@cf/google/gemma-4-26b-a4b-it";
const CF_EMBED_MODEL  = "@cf/baai/bge-small-en-v1.5";
const CF_RERANK_MODEL = "@cf/baai/bge-reranker-base";

const CANDIDATE_POOL = 10;   // chunks pulled from pgvector before reranking
const TOP_K          = 3;    // chunks sent to Gemma after reranking

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface RetrievedChunk {
  chunk_id?: string;
  content: string;
  source?: string | null;
  similarity?: number;
  rerankScore?: number;
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

async function vectorSearch(queryEmbedding: number[]): Promise<RetrievedChunk[]> {
  // Pull a larger pool than we'll actually use — the reranker will pick the best.
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: 0.15, // slightly lower than before — reranker compensates
    match_count: CANDIDATE_POOL,
  });
  if (error || !data) return [];
  return (data as Array<{ chunk_id?: string; content: string; source?: string | null; similarity: number }>)
    .map((r) => ({
      chunk_id: r.chunk_id,
      content: r.content,
      source: r.source ?? null,
      similarity: r.similarity,
    }));
}

// ── Reranker ─────────────────────────────────────────────────────────────────
// Cross-encoder that scores (query, chunk) pairs. Much smarter than the
// bi-encoder on its own: it reads the full query alongside each candidate
// and can distinguish "who is the mayor" (wants Lester Miller) from
// "who is the mayor pro tem" (wants Valerie Wynn), or procedural voting
// from a 2012 consolidation referendum — without brittle hand-coded filters.
async function rerank(query: string, candidates: RetrievedChunk[]): Promise<RetrievedChunk[]> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN || candidates.length === 0) return candidates;

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_RERANK_MODEL}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        contexts: candidates.map((c) => ({ text: c.content })),
        top_k: candidates.length, // rerank all, we trim after
      }),
    });
    if (!res.ok) return candidates; // fail open — return pre-ranked order

    const data = await res.json();
    // Response shape: { result: { response: [{ id, score }, ...] } }
    const scores = data?.result?.response as Array<{ id: number; score: number }> | undefined;
    if (!scores?.length) return candidates;

    // Attach scores and sort
    const withScores = scores.map((s) => ({
      ...candidates[s.id],
      rerankScore: s.score,
    }));
    withScores.sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
    return withScores;
  } catch {
    return candidates;
  }
}

// ── Keyword search (fallback) ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","and","for","are","was","were","has","have","had","this","that","with",
  "from","they","them","their","what","when","where","who","how","can","will",
  "about","which","there","been","more","also","into","than","then","some",
  "would","could","should","does","did","not","but","you","your","its","our",
  "tell","me","is","in","of","to","a","an","do","on","at","by","be","it",
]);

async function keywordSearch(query: string): Promise<RetrievedChunk[]> {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  if (words.length === 0) return [];

  const ilikeConditions = words.map((w) => `content.ilike.%${w}%`).join(",");
  const { data: rows } = await supabase
    .from("knowledge_chunks")
    .select("chunk_id, content, source")
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
      return { chunk_id: row.chunk_id, content: row.content, source: row.source, score, matchCount };
    })
    .filter((r) => r.matchCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_POOL)
    .map(({ chunk_id, content, source }) => ({ chunk_id, content, source: source ?? null }));
}

// ── LLM call ─────────────────────────────────────────────────────────────────

function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "No relevant information found in the knowledge base.";
  return chunks
    .map((c, i) => {
      const src = c.source ? ` (source: ${c.source})` : "";
      return `[Source ${i + 1}${src}]\n${c.content}`;
    })
    .join("\n\n");
}

async function askGemma(question: string, context: string): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_LLM_MODEL}`;

  const systemPrompt =
    "You are Mulberry, a civic AI assistant built into PeachTracker (peachtracker.vercel.app), " +
    "a civic tracker for Macon-Bibb County, Georgia. " +
    "Answer questions about local elections, commissioners, voting, and civic facts. " +
    "Keep answers concise (2-4 sentences), factual, and friendly. " +
    "Use ONLY the information in the SOURCES below to answer. " +
    "Do not quote statutory or legal text verbatim — summarize in plain English. " +
    "IMPORTANT: 'Mayor' and 'mayor pro tem' are different roles. The mayor is the chief executive " +
    "of Macon-Bibb County (currently Lester Miller). The mayor pro tem is a commissioner elected " +
    "by the commission to lead meetings in the mayor's absence (currently Valerie Wynn). " +
    "If the sources contain information unrelated to the question, ignore it. " +
    "If the sources do not contain enough information to answer, say so honestly " +
    "and point to a relevant resource.\n" +
    "When relevant, link to:\n" +
    "- Elections & races: peachtracker.vercel.app/elections\n" +
    "- Commission districts & members: peachtracker.vercel.app/commission\n" +
    "- Georgia My Voter Page: mvp.sos.ga.gov\n" +
    "- Bibb County Board of Elections: maconbibb.us/board-of-elections or (478) 621-6622\n\n" +
    "SOURCES:\n" + context;

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
    let candidates: RetrievedChunk[] = [];
    const embedding = await embedText(question);

    if (embedding) {
      candidates = await vectorSearch(embedding);
      console.log(`[mulberry] vector search: ${candidates.length} candidates`);
    }

    // 2. Fall back to keyword search if vector search returned nothing
    if (candidates.length === 0) {
      candidates = await keywordSearch(question);
      console.log(`[mulberry] keyword fallback: ${candidates.length} candidates`);
    }

    // 3. Rerank with cross-encoder (if we have more than TOP_K candidates)
    let topChunks: RetrievedChunk[] = candidates;
    if (candidates.length > TOP_K) {
      topChunks = await rerank(question, candidates);
      console.log(`[mulberry] reranked; top scores: ${topChunks.slice(0, 3).map((c) => c.rerankScore?.toFixed(3) ?? "-").join(", ")}`);
    }
    topChunks = topChunks.slice(0, TOP_K);

    // 4. Call Gemma with context (or without if no chunks found)
    if (CF_ACCOUNT_ID && CF_API_TOKEN) {
      const context = formatContext(topChunks);

      try {
        const reply = await askGemma(question, context);
        return NextResponse.json({ reply });
      } catch (aiErr) {
        console.error("[mulberry] Gemma call failed:", aiErr);
      }
    }

    // 5. Static fallback
    if (topChunks.length === 0) {
      return NextResponse.json({
        reply:
          "I don't have specific information about that yet. " +
          "Check the Bibb County Board of Elections at maconbibb.us/board-of-elections " +
          "or call (478) 621-6622. You can also visit mvp.sos.ga.gov for your ballot and polling place.",
      });
    }

    return NextResponse.json({ reply: topChunks[0].content });
  } catch (err) {
    console.error("[mulberry] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
