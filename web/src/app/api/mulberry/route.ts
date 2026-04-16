import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Mulberry API Route ────────────────────────────────────────────────────────
// 1. Searches knowledge_chunks in Supabase for relevant context
// 2. Passes question + context to Cloudflare Workers AI (Llama 3.1 8B)
// 3. Returns a natural language answer grounded in local Macon-Bibb data
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_MODEL      = "@cf/meta/llama-3.1-8b-instruct";

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
]);

async function searchKnowledge(query: string): Promise<string[]> {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  if (words.length === 0) return [];

  const conditions = words.map((w) => `content.ilike.%${w}%`).join(",");
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("content, category")
    .or(conditions)
    .limit(8);

  if (error || !data) return [];

  const scored = data.map((row) => {
    const lower = row.content.toLowerCase();
    const score = words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
    return { content: row.content, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.content);
}

async function askCloudflareAI(question: string, context: string): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;

  const systemPrompt =
    "You are Mulberry, a civic AI assistant for Macon-Bibb County, Georgia. " +
    "Answer questions about local elections, commissioners, voting, and civic facts. " +
    "Keep answers concise (2-4 sentences), factual, and friendly. " +
    "Base your answer strictly on the provided context. " +
    "If the context doesn't cover the question, say so and direct the user to " +
    "maconbibb.us/board-of-elections or (478) 621-6622.\n\n" +
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
    throw new Error(`Cloudflare AI error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data?.result?.response?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await req.json();
    if (!messages?.length) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const question = messages[messages.length - 1]?.content ?? "";

    // 1. Retrieve relevant knowledge chunks
    const chunks = await searchKnowledge(question);

    // 2. If Cloudflare is configured, generate a natural language answer
    if (CF_ACCOUNT_ID && CF_API_TOKEN && chunks.length > 0) {
      const context = chunks.join("\n\n");
      const reply = await askCloudflareAI(question, context);
      if (reply) return NextResponse.json({ reply });
    }

    // 3. Fallback: return raw chunks if CF not configured or no results
    if (chunks.length === 0) {
      return NextResponse.json({
        reply:
          "I don't have specific information about that yet. " +
          "Check the Bibb County Board of Elections at maconbibb.us/board-of-elections " +
          "or call (478) 621-6622. You can also visit mvp.sos.ga.gov for your ballot and polling place.",
      });
    }

    return NextResponse.json({
      reply: chunks.slice(0, 2).join("\n\n"),
    });
  } catch (err) {
    console.error("[mulberry] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
