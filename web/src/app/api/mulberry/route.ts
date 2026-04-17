import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import {
  embedText,
  vectorSearch,
  questionVectorSearch,
  mergeCandidates,
  rerank,
  keywordSearch,
  formatContext,
  TOP_K,
  type RetrievedChunk,
} from "@/lib/mulberry/retrieval";

// ── Mulberry API Route ────────────────────────────────────────────────────────
// RAG pipeline (shared with /api/mulberry/debug via @/lib/mulberry/retrieval):
//   1. Embed the user's question with Cloudflare BGE-small (384 dims).
//   2. Pull top-CANDIDATE_POOL chunks from Supabase via pgvector similarity.
//   3. Re-rank with Cloudflare BGE-reranker-base (cross-encoder on (q, chunk)).
//   4. Keep TOP_K and send them to Gemini 2.5 Flash as context.
//
// Fallback if embedding or reranking fails: IDF keyword search.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const GEMINI_MODEL   = "gemini-2.5-flash";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── LLM call (Gemini 2.5 Flash) ──────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are Mulberry, a civic assistant built into PeachTracker (peachtracker.vercel.app), \
a civic tracker for Macon-Bibb County, Georgia. \
PeachTracker's mission is to make local government understandable for people who don't \
normally follow politics — first-time voters, folks who've felt locked out of civic spaces, \
busy people who just want a straight answer. You are the voice of that mission.

VOICE:
- Write like a helpful neighbor, not a government document.
- Roughly sixth-grade reading level. Short sentences. Concrete nouns.
- Explain civic jargon the first time it comes up. ("A primary — when each party picks its \
candidates." "A runoff — a second round between the top two if no one won a majority.")
- Warm, not chatty. No exclamation points. No emoji. No "Great question!" No "Obviously," \
"simply," or "as you know" — never make the reader feel they should have known already.
- Do NOT quote statute text. Do NOT cite section numbers in the body of your answer \
(e.g. don't say "Under Section 14(a)..."). The SOURCES may include citations for your \
reference — summarize them in plain English instead.
- Avoid instructional lead-ins like "First," "Step 1," etc. Lead with the answer itself \
in a warm register ("You'll want to start by..." rather than "First, find out...").

ANSWER RULES:
1. Use ONLY the information in the SOURCES block. If the sources don't have enough \
information, say so honestly — do not invent facts.
2. Keep answers to 2–4 sentences unless the question genuinely needs more.
3. Answer the question behind the question. "Who is my commissioner?" → tell them HOW to \
find out (an address-based lookup) AND give them a way to contact that person once they know.
4. "Mayor" and "mayor pro tem" are DIFFERENT roles. The mayor is the chief executive of \
Macon-Bibb County (currently Lester Miller). The mayor pro tem is a commissioner elected by \
the commission to lead meetings in the mayor's absence. Do not conflate them.
5. Questions that need a home address (who is my commissioner / what district am I in / \
where do I vote): don't guess. Send them to https://mvp.sos.ga.gov to look up by address, \
or to peachtracker.vercel.app/commission to see all nine districts on a map.
6. If the sources mention a "labor commissioner" (a state office) when the user asked about \
"my commissioner," that's the wrong one — they mean their county commission district \
representative. Redirect to mvp.sos.ga.gov.
7. Typos and informal spellings ("maor" = "mayor", "commish" = "commissioner") are fine — \
treat them as the intended word. The sources were already retrieved for the corrected intent.
8. When relevant, link to:
   - Elections & races: peachtracker.vercel.app/elections
   - Commission districts & members: peachtracker.vercel.app/commission
   - Georgia My Voter Page (ballot, polling place, district lookup): https://mvp.sos.ga.gov
   - Bibb County Board of Elections: https://maconbibb.us/board-of-elections or (478) 621-6622
`;

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
  | { kind: "safety" }
  | { kind: "rate_limit" }
  | { kind: "error" };

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
        // Gemini 2.5 Flash counts internal "thinking" tokens against this budget.
        // At 400 it was exhausting thinking before emitting a full answer, so
        // replies came back cut mid-sentence with finishReason=MAX_TOKENS.
        // 2048 leaves ample room for thinking + a 2–4 sentence civic answer.
        maxOutputTokens: 2048,
      },
    });

    const userPrompt = `SOURCES:\n${context}\n\nQUESTION: ${question}`;
    const result = await model.generateContent(userPrompt);
    const response = result.response;

    const candidates = response.candidates ?? [];
    const blockedFinishReasons = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);
    const blocked =
      !!response.promptFeedback?.blockReason ||
      candidates.some((c) => c.finishReason && blockedFinishReasons.has(String(c.finishReason)));
    if (blocked) {
      console.warn("[mulberry] Gemini safety block:", response.promptFeedback?.blockReason);
      return { kind: "safety" };
    }

    // Detect token-limit truncation so we don't silently ship a half-sentence.
    const finishReasons = candidates.map((c) => String(c.finishReason ?? ""));
    const hitMaxTokens = finishReasons.includes("MAX_TOKENS");

    const text = response.text()?.trim();
    if (!text) {
      if (hitMaxTokens) {
        console.warn("[mulberry] Gemini hit MAX_TOKENS with no visible text — thinking budget exhausted");
      }
      return { kind: "safety" };
    }
    if (hitMaxTokens) {
      console.warn(
        `[mulberry] Gemini hit MAX_TOKENS; reply length=${text.length}. ` +
        `Consider raising maxOutputTokens.`
      );
    }
    return { kind: "ok", reply: text };
  } catch (err: unknown) {
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

    // 1. Dual vector search — questions AND body — merged by chunk_id.
    //    Question matches usually win on similarity because the query echoes
    //    a stored hypothetical (cosine ~0.9+). Body matches backfill chunks
    //    no question happened to cover.
    let candidates: RetrievedChunk[] = [];
    const embedding = await embedText(question);

    if (embedding) {
      const [{ chunks: questionChunks }, bodyChunks] = await Promise.all([
        questionVectorSearch(embedding),
        vectorSearch(embedding),
      ]);
      candidates = mergeCandidates(questionChunks, bodyChunks);
      console.log(
        `[mulberry] vector: questions=${questionChunks.length} body=${bodyChunks.length} merged=${candidates.length}`
      );
    }

    // 2. Keyword fallback if both vector paths returned nothing
    if (candidates.length === 0) {
      candidates = await keywordSearch(question);
      console.log(`[mulberry] keyword fallback: ${candidates.length} candidates`);
    }

    // 3. Rerank with cross-encoder if we have more than TOP_K candidates
    let topChunks: RetrievedChunk[] = candidates;
    if (candidates.length > TOP_K) {
      topChunks = await rerank(question, candidates);
      console.log(`[mulberry] reranked; top scores: ${topChunks.slice(0, 3).map((c) => c.rerankScore?.toFixed(3) ?? "-").join(", ")}`);
    }
    topChunks = topChunks.slice(0, TOP_K);

    // 4. Ask Gemini
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
          break;
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
