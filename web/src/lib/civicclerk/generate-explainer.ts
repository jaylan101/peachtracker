// Generates a one-sentence plain-language summary for an agenda item.
//
// Used in two places:
// 1. sync-civicclerk/route.ts — called on insert of a new agenda_item to
//    populate summary_eli5 for items without a manual summary.
// 2. /admin/explainers "Regenerate" button — lets admins refresh a bad summary
//    on demand.
//
// Voice rules (see feedback_peachtracker_voice.md in auto-memory, and the
// rules encoded in the prompt below): ~6th-grade reading level, concrete
// nouns, no jargon, warm-not-chatty, lead with the action. One sentence.
//
// Model: gemini-2.5-flash, same as Mulberry. Returns null on any failure
// (missing API key, network error, model refusal, empty output) so callers
// can fall back to leaving summary_eli5 null — the commissioner page
// gracefully skips rendering when summary is absent.

import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

// Keep the input compact. Titles are sometimes truncated verbose legalese,
// full_text when present often has the useful detail. Cap full_text at 2000
// chars so a single oversized attachment doesn't blow up the prompt.
const FULL_TEXT_CAP = 2000;

const SYSTEM_PROMPT = `You write one-sentence plain-language summaries of Macon-Bibb County, Georgia commission agenda items for PeachTracker, a civic tool aimed at first-time voters and people who don't normally follow local government.

Voice rules:
- ONE sentence. Under 20 words when possible, never over 30.
- Lead with the action the commission is taking (hires, approves, authorizes, rezones, accepts, renews, etc.), then what it affects.
- Concrete nouns. No legalese. ~6th-grade reading level.
- Include a dollar amount or location only if it's in the source material — do NOT invent numbers, street names, or beneficiaries.
- Warm, direct, kind. No exclamation points, no emoji, no "simply" or "obviously".
- If the source is truly opaque (boilerplate, ceremonial, procedural), say what the commission is doing procedurally: "Approves the meeting agenda." / "Recognizes a local student's achievement." / "Holds a public hearing on a zoning request."
- No meta-commentary. No "This item...", "The commission will...", "This resolution...". Start with the verb.

Good examples:
- "Hires a contractor to repave Poplar Street."
- "Approves a $450,000 grant for youth sports programs."
- "Rezones a parcel on Hightower Road from residential to commercial."
- "Authorizes the mayor to sign a water-service agreement with the county."
- "Recognizes March as Women's History Month in Macon-Bibb."

Bad examples (do not write these):
- "This resolution authorizes the mayor to execute a contract..." (starts with "This resolution" — remove the lead-in)
- "The commission will vote on hiring a contractor..." (describes the vote, not the substance)
- "Simply a routine administrative item." ("simply" is condescending)

Output: the sentence only. No quotes, no preamble, no trailing whitespace.`;

export interface ExplainerInput {
  title: string;
  fullText?: string | null;
}

export interface ExplainerResult {
  summary: string | null;
  error?: string;
}

// Shared client. Re-used across calls so we don't reinitialize the SDK on every
// agenda item during a sync.
let _client: GoogleGenerativeAI | null = null;
function client(): GoogleGenerativeAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!_client) _client = new GoogleGenerativeAI(GEMINI_API_KEY);
  return _client;
}

export async function generateExplainer(input: ExplainerInput): Promise<ExplainerResult> {
  const c = client();
  if (!c) return { summary: null, error: "GOOGLE_GENERATIVE_AI_API_KEY not set" };

  const title = (input.title ?? "").trim();
  if (!title) return { summary: null, error: "empty title" };

  const fullText = (input.fullText ?? "").trim().slice(0, FULL_TEXT_CAP);
  const userPrompt = fullText
    ? `TITLE: ${title}\n\nFULL TEXT:\n${fullText}`
    : `TITLE: ${title}`;

  try {
    const model = c.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.3,
        // Keep output tiny. One sentence fits well under 100 tokens; allow
        // headroom for Gemini 2.5's thinking budget (see feedback_gemini_thinking_budget.md).
        maxOutputTokens: 2048,
      },
    });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text()?.trim();
    if (!text) {
      const reason = result.response.candidates?.[0]?.finishReason ?? "unknown";
      return { summary: null, error: `empty response (finishReason=${reason})` };
    }

    // Strip accidental wrapping quotes or leading bullets that models sometimes add.
    const clean = text
      .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "")
      .replace(/^[-*•]\s*/, "")
      .trim();

    // Hard length cap as a safety net. If the model went over, truncate at
    // the last full sentence within 240 chars.
    const capped = clean.length > 240
      ? clean.slice(0, 240).replace(/[^.!?]*$/, "").trim() || clean.slice(0, 240)
      : clean;

    return { summary: capped };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { summary: null, error: msg };
  }
}
