import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// ── Mulberry API Route ────────────────────────────────────────────────────────
// RAG pipeline:
//   1. Embed the user's question with Cloudflare BGE-small (384 dims).
//   2. Pull candidate_pool=10 chunks from Supabase via pgvector similarity.
//   3. Re-rank those with Cloudflare BGE-reranker-base — much better at
//      telling "procedural voting rules" apart from "a 2012 referendum
//      that used the word 'vote'" than a bi-encoder alone.
//   4. Keep top_k=3 and send them to **Gemini 2.5 Flash** as context for
//      the final answer. (Retrieval stays on Cloudflare; only generation
//      moved to Gemini for better instruction-following on refusal cases.)
//
// Fallback if embedding or reranking fails: IDF keyword search.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Cloudflare is still used for retrieval only (embedding + reranking).
const CF_ACCOUNT_ID   = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN    = process.env.CF_API_TOKEN;
const CF_EMBED_MODEL  = "@cf/baai/bge-small-en-v1.5";
const CF_RERANK_MODEL = "@cf/baai/bge-reranker-base";

// Gemini is the answer-generation model.
const GEMINI_API_KEY  = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const GEMINI_MODEL    = "gemini-2.5-flash";

const CANDIDATE_POOL = 10;   // chunks pulled from pgvector before reranking
const TOP_K          = 3;    // chunks sent to Gemini after reranking

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

// ── LLM call (Gemini 2.5 Flash) ──────────────────────────────────────────────

function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "No relevant information found in the knowledge base.";
  return chunks
    .map((c, i) => {
      const src = c.source ? ` (source: ${c.source})` : "";
      return `[Source ${i + 1}${src}]\n${c.content}`;
    })
    .join("\n\n");
}

const SYSTEM_PROMPT = `\
You are Mulberry, a civic AI assistant built into PeachTracker (peachtracker.vercel.app), \
a civic tracker for Macon-Bibb County, Georgia. \
Answer questions about local elections, commissioners, voting, and civic facts.

RULES:
1. Use ONLY the information in the SOURCES block to answer. If the sources don't contain \
enough information, say so honestly — do not invent facts.
2. Keep answers concise (2–4 sentences), factual, and friendly. Plain English, not statute text.
3. "Mayor" and "mayor pro tem" are DIFFERENT roles. The mayor is the chief executive of \
Macon-Bibb County (currently Lester Miller). The mayor pro tem is a commissioner elected \
by the commission to lead meetings in the mayor's absence (currently Valerie Wynn). Do not \
conflate them.
4. REFUSE to answer questions that require personal info you don't have. In particular:
   - "Who is my commissioner?" / "What district am I in?" / "Where do I vote?" — these all \
need the user's home address. Don't guess. Instead, point them to \
https://mvp.sos.ga.gov (Georgia My Voter Page) to look it up by address, or to \
peachtracker.vercel.app/commission to see all nine districts with their maps.
   - If the sources contain a labor commissioner (state office) and the user asked about \
"my commissioner," that's the wrong one — they mean their Macon-Bibb County Commission \
district representative. Redirect to mvp.sos.ga.gov.
5. Treat typos and informal spellings ("maor" = "mayor", "commish" = "commissioner") as the \
intended word. The SOURCES you're given have already been retrieved for the corrected intent.
6. When relevant, link to:
   - Elections & races: peachtracker.vercel.app/elections
   - Commission districts & members: peachtracker.vercel.app/commission
   - Georgia My Voter Page (ballot, polling place, district lookup): https://mvp.sos.ga.gov
   - Bibb County Board of Elections: https://maconbibb.us/board-of-elections or (478) 621-6622
`;

// Loosen safety filters slightly — civic content (violence in history, election law, etc.)
// can trip default thresholds. We still keep the hate/harassment/sexual defaults strict by
// leaving them at BLOCK_MEDIUM_AND_ABOVE.
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

const BOARD_OF_ELECTIONS_FALLBACK =
  "I can't answer that right now. For help, contact the Bibb County Board of Elections " +
  "at (478) 621-6622 or maconbibb.us/board-of-elections.";

const RATE_LIMIT_FALLBACK =
  "I'm getting a lot of questions right now — please try again in a moment. " +
  "In the meantime, you can visit peachtracker.vercel.app or mvp.sos.ga.gov.";

type GeminiOutcome =
  | { kind: "ok"; reply: string }
  | { kind: "safety" }       // blocked by Gemini's safety filters
  | { kind: "rate_limit" }   // 429 from Gemini
  | { kind: "error" };       // any other failure

async function askGemini(question: string, context: string): Promise<GeminiOutcome> {
  if (!GEMINI_API_KEY) return { kind: "error" };

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 400,
      },
    });

    const userPrompt = `SOURCES:\n${context}\n\nQUESTION: ${question}`;
    const result = await model.generateContent(userPrompt);
    const response = result.response;

    // Safety block: response exists but has no candidates / finishReason = SAFETY.
    const candidates = response.candidates ?? [];
    const blockedFinishReasons = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);
    const blocked =
      !!response.promptFeedback?.blockReason ||
      candidates.some((c) => c.finishReason && blockedFinishReasons.has(String(c.finishReason)));
    if (blocked) {
      console.warn("[mulberry] Gemini safety block:", response.promptFeedback?.blockReason);
      return { kind: "safety" };
    }

    const text = response.text()?.trim();
    if (!text) return { kind: "safety" }; // no content came back — treat as block
    return { kind: "ok", reply: text };
  } catch (err: unknown) {
    // The @google/generative-ai SDK throws with a status code on HTTP errors.
    const errObj = err as { status?: number; message?: string };
    const status = errObj?.status;
    const msg = errObj?.message ?? "";
    if (status === 429 || /quota|rate/i.test(msg)) {
      console.warn("[mulberry] Gemini rate-limited:", msg);
      return { kind: "rate_limit" };
    }
    console.error("[mulberry] Gemini error:", err);
    return { kind: "error" };
  }
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

    // 4. Call Gemini with context (or the empty-context string if nothing retrieved)
    if (GEMINI_API_KEY) {
      const context = formatContext(topChunks);
      const outcome = await askGemini(question, context);

      switch (outcome.kind) {
        case "ok":
          return NextResponse.json({ reply: outcome.reply });
        case "safety":
          return NextResponse.json({ reply: BOARD_OF_ELECTIONS_FALLBACK });
        case "rate_limit":
          return NextResponse.json({ reply: RATE_LIMIT_FALLBACK });
        case "error":
          // fall through to static fallback below
          break;
      }
    }

    // 5. Static fallback (no Gemini key configured, or Gemini errored)
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
