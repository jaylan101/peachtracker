import { NextRequest, NextResponse } from "next/server";

// ── Mulberry API Route ────────────────────────────────────────────────────────
// This route proxies chat messages to the HuggingFace ZeroGPU Space running
// Gemma 4. The HF_SPACE_URL env var should point to your deployed HF Space's
// /api/chat endpoint once it's live.
//
// During development / before HF Space is deployed, it returns a placeholder.
// ─────────────────────────────────────────────────────────────────────────────

const HF_SPACE_URL = process.env.HF_SPACE_URL; // e.g. https://YOUR-USER-mulberry-macon.hf.space/api/chat

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: Message[] } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // ── If HF Space is configured, proxy to it ──
    if (HF_SPACE_URL) {
      const hfRes = await fetch(HF_SPACE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      if (!hfRes.ok) {
        throw new Error(`HF Space returned ${hfRes.status}`);
      }

      const data = await hfRes.json();
      return NextResponse.json({ reply: data.reply });
    }

    // ── Placeholder until HF Space is live ──
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() ?? "";

    let reply =
      "I'm Mulberry, your Macon-Bibb civic guide. I'm still getting set up — check back soon and I'll be ready to answer your questions about elections, commissioners, and local government.";

    if (lastMessage.includes("election") || lastMessage.includes("vote") || lastMessage.includes("ballot")) {
      reply =
        "The next election is the May 19, 2026 Georgia Primary. Macon-Bibb has 8 contested local races including Board of Education, Water Authority, and State Legislature seats. Full race details are on the Elections page.";
    } else if (lastMessage.includes("commissioner") || lastMessage.includes("commission")) {
      reply =
        "The Macon-Bibb County Commission has elected commissioners representing different districts. You can view commissioner profiles, their voting records, and recent meeting votes on PeachTracker's Commission page.";
    } else if (lastMessage.includes("where") && (lastMessage.includes("vote") || lastMessage.includes("poll"))) {
      reply =
        "Voting locations for Macon-Bibb County elections are managed by the Bibb County Board of Elections. Visit www.bibbvotes.com or call the Board of Elections for your specific polling place.";
    } else if (lastMessage.includes("register") || lastMessage.includes("registration")) {
      reply =
        "In Georgia, you must register at least 28 days before an election. You can register online at mvp.sos.ga.gov, by mail, or in person at the Bibb County Board of Elections.";
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[mulberry] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
