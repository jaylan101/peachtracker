import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Mulberry API Route ────────────────────────────────────────────────────────
// Searches the knowledge_chunks table in Supabase using keyword matching,
// returns the most relevant chunks as the answer.
//
// Step 3: When HF_SPACE_URL is set, chunks are passed as context to Gemma 4
// running on HuggingFace ZeroGPU for a natural language response.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // Use service key if available (server-side only), fall back to anon
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Message {
  role: "user" | "assistant";
  content: string;
}

// Stop words to skip when building keyword search
const STOP_WORDS = new Set([
  "the","and","for","are","was","were","has","have","had","this","that","with",
  "from","they","them","their","what","when","where","who","how","can","will",
  "about","which","there","been","more","also","into","than","then","some",
  "would","could","should","does","did","not","but","you","your","its","our",
  "tell","me","is","in","of","to","a","an","do","on","at","by","be","it",
]);

async function searchKnowledge(query: string): Promise<Array<{content: string, category: string}>> {
  // Pull meaningful keywords from the question
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  if (words.length === 0) return [];

  // OR search: any chunk containing any keyword
  const conditions = words.map((w) => `content.ilike.%${w}%`).join(",");

  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("content, category, chunk_id")
    .or(conditions)
    .limit(8);

  if (error || !data || data.length === 0) return [];

  // Score: count how many query words appear in each chunk
  const scored = data.map((row) => {
    const lower = row.content.toLowerCase();
    const score = words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
    return { content: row.content, category: row.category, score };
  });

  // Return top 3 by score
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ content, category }) => ({ content, category }));
}

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const question = messages[messages.length - 1]?.content ?? "";
    const chunks = await searchKnowledge(question);

    // ── Step 3: If HF Space is live, pass chunks as RAG context ──
    if (process.env.HF_SPACE_URL && chunks.length > 0) {
      const context = chunks.map((c) => c.content).join("\n\n");
      const hfRes = await fetch(process.env.HF_SPACE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, context }),
      });
      if (hfRes.ok) {
        const data = await hfRes.json();
        return NextResponse.json({ reply: data.reply });
      }
    }

    // ── Fallback: return retrieved chunks directly ──
    if (chunks.length === 0) {
      return NextResponse.json({
        reply:
          "I don't have specific information about that in my knowledge base yet. " +
          "For the most accurate info, visit the Bibb County Board of Elections at maconbibb.us/board-of-elections " +
          "or call (478) 621-6622. You can also check mvp.sos.ga.gov for your personalized ballot and polling place.",
      });
    }

    // Return top 1-2 chunks as the answer (clean, direct)
    const reply = chunks.length === 1
      ? chunks[0].content
      : chunks.slice(0, 2).map((c) => c.content).join("\n\n");

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[mulberry] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
