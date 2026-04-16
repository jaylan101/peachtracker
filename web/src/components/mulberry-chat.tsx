"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "When is the next election?",
  "Who is my commissioner?",
  "Where do I vote?",
  "How does the commission vote?",
];

export function MulberryChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);

    try {
      const res = await fetch("/api/mulberry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "Sorry, I couldn't find an answer to that." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* ── Floating bubble ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Mulberry" : "Ask Mulberry"}
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          zIndex: 9999,
          width: 60,
          height: 60,
          background: "var(--text)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 24px rgba(42,39,37,0.22)",
          transition: "transform 160ms ease, background 160ms ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--peach)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--text)")}
      >
        {open ? (
          /* X icon */
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="2" y1="2" x2="16" y2="16" stroke="white" strokeWidth="2.2" strokeLinecap="square" />
            <line x1="16" y1="2" x2="2" y2="16" stroke="white" strokeWidth="2.2" strokeLinecap="square" />
          </svg>
        ) : (
          /* Chat icon */
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="2" width="20" height="15" stroke="white" strokeWidth="1.8" />
            <path d="M6 20 L10 16 H2 L6 20Z" fill="white" />
            <line x1="6" y1="8" x2="18" y2="8" stroke="white" strokeWidth="1.5" />
            <line x1="6" y1="11.5" x2="14" y2="11.5" stroke="white" strokeWidth="1.5" />
          </svg>
        )}
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            right: 28,
            width: "min(420px, calc(100vw - 40px))",
            height: "min(580px, calc(100vh - 140px))",
            background: "var(--card)",
            border: "2px solid var(--text)",
            zIndex: 9998,
            display: "flex",
            flexDirection: "column",
            fontFamily: "var(--font-outfit), Outfit, system-ui, sans-serif",
            boxShadow: "0 8px 40px rgba(42,39,37,0.18)",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: "var(--text)",
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                background: "var(--peach)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8 2 4 5 4 9c0 3 1.5 5.5 4 7l-1 4 4-2c.3 0 .7.1 1 .1 4.4 0 8-3.6 8-8S16.4 2 12 2Z" fill="white" />
              </svg>
            </div>
            <div>
              <div
                style={{
                  color: "white",
                  fontWeight: 800,
                  fontSize: "1rem",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.1,
                }}
              >
                Mulberry
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.55)",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginTop: 3,
                }}
              >
                Macon-Bibb Civic Guide
              </div>
            </div>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  background: "#5E9470",
                  borderRadius: "50%",
                  animation: "rt-pulse 1.6s ease-in-out infinite",
                }}
              />
              <span
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Online
              </span>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Greeting */}
            {messages.length === 0 && (
              <div>
                <div style={assistantBubbleStyle}>
                  <span style={assistantNameStyle}>Mulberry</span>
                  Hey there — I&apos;m Mulberry, your Macon-Bibb civic guide. Ask me about elections,
                  commissioners, voting locations, or how local government works.
                </div>
              </div>
            )}

            {/* Suggested questions */}
            {showSuggestions && messages.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <div style={suggestionLabelStyle}>SUGGESTED QUESTIONS</div>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => send(q)} style={suggestionBtnStyle}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--peach)";
                      e.currentTarget.style.color = "var(--peach)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Conversation */}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" ? (
                  <div style={assistantBubbleStyle}>
                    <span style={assistantNameStyle}>Mulberry</span>
                    {m.content}
                  </div>
                ) : (
                  <div style={userBubbleStyle}>{m.content}</div>
                )}
              </div>
            ))}

            {/* Loading dots */}
            {loading && (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <div style={{ ...assistantBubbleStyle, padding: "10px 14px" }}>
                  <span style={assistantNameStyle}>Mulberry</span>
                  <span style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 2 }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          background: "var(--text-light)",
                          display: "inline-block",
                          animation: `mulberry-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              borderTop: "1.5px solid var(--border)",
              display: "flex",
              flexShrink: 0,
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Ask about Macon-Bibb…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                padding: "14px 16px",
                fontSize: "0.92rem",
                fontFamily: "inherit",
                background: "transparent",
                color: "var(--text)",
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              style={{
                background: input.trim() && !loading ? "var(--peach)" : "var(--border)",
                border: "none",
                borderLeft: "1.5px solid var(--border)",
                padding: "14px 18px",
                cursor: input.trim() && !loading ? "pointer" : "default",
                transition: "background 160ms ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 8H14M14 8L9 3M14 8L9 13" stroke="white" strokeWidth="2" strokeLinecap="square" />
              </svg>
            </button>
          </div>

          {/* Footer attribution */}
          <div
            style={{
              background: "var(--bg)",
              borderTop: "1.5px solid var(--border)",
              padding: "6px 14px",
              fontSize: "0.62rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-light)",
              flexShrink: 0,
            }}
          >
            Powered by Gemma · A PeachTracker project
          </div>
        </div>
      )}

      {/* Keyframe injection */}
      <style>{`
        @keyframes mulberry-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const assistantBubbleStyle: React.CSSProperties = {
  background: "var(--peach-bg)",
  border: "1.5px solid var(--peach-pastel)",
  padding: "12px 14px",
  fontSize: "0.88rem",
  lineHeight: 1.6,
  color: "var(--text)",
  maxWidth: "88%",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const assistantNameStyle: React.CSSProperties = {
  fontSize: "0.62rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "var(--peach)",
  marginBottom: 2,
};

const userBubbleStyle: React.CSSProperties = {
  background: "var(--text)",
  color: "white",
  padding: "10px 14px",
  fontSize: "0.88rem",
  lineHeight: 1.55,
  maxWidth: "80%",
};

const suggestionLabelStyle: React.CSSProperties = {
  fontSize: "0.62rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "var(--text-light)",
  marginBottom: 2,
};

const suggestionBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1.5px solid var(--border)",
  padding: "9px 13px",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "var(--text)",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  transition: "border-color 140ms ease, color 140ms ease",
  letterSpacing: "-0.005em",
};
