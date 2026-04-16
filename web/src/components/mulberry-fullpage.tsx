"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const TOPIC_GROUPS = [
  {
    label: "Elections",
    questions: [
      "When is the next election in Macon-Bibb?",
      "Who are the candidates for BOE Post 7?",
      "What were the District 5 runoff results?",
    ],
  },
  {
    label: "Commissioners",
    questions: [
      "Who is my Macon-Bibb commissioner?",
      "How does the commission vote?",
      "What happened at the last commission meeting?",
    ],
  },
  {
    label: "Voting",
    questions: [
      "Where do I vote in Macon-Bibb?",
      "What's the voter registration deadline?",
      "When is early voting?",
    ],
  },
];

export function MulberryFullPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeGroup, setActiveGroup] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
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
        {
          role: "assistant",
          content: data.reply ?? "Sorry, I couldn't find an answer to that.",
        },
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

  const hasMessages = messages.length > 0;

  return (
    <div>
      {/* Suggested topics — only shown before first message */}
      {!hasMessages && (
        <div style={{ marginBottom: 32 }}>
          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              borderBottom: "2px solid var(--text)",
              marginBottom: 16,
              gap: 0,
            }}
          >
            {TOPIC_GROUPS.map((g, i) => (
              <button
                key={g.label}
                onClick={() => setActiveGroup(i)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: i === activeGroup ? "3px solid var(--peach)" : "3px solid transparent",
                  marginBottom: -2,
                  padding: "10px 20px",
                  fontSize: "var(--kicker)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: i === activeGroup ? "var(--peach)" : "var(--text-secondary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "color 140ms ease",
                }}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* Questions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TOPIC_GROUPS[activeGroup].questions.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                style={{
                  background: "var(--card)",
                  border: "1.5px solid var(--border)",
                  padding: "14px 18px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: "var(--text)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  transition: "border-color 140ms ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--peach)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                {q}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="var(--peach)" strokeWidth="1.8" strokeLinecap="square" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation */}
      {hasMessages && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 28 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {m.role === "assistant" ? (
                <div
                  style={{
                    background: "var(--peach-bg)",
                    border: "1.5px solid var(--peach-pastel)",
                    padding: "16px 20px",
                    maxWidth: "85%",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.62rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.14em",
                      color: "var(--peach)",
                      marginBottom: 8,
                    }}
                  >
                    Mulberry
                  </div>
                  <div
                    style={{
                      fontSize: "var(--body)",
                      lineHeight: 1.65,
                      color: "var(--text)",
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "var(--text)",
                    color: "white",
                    padding: "14px 18px",
                    maxWidth: "75%",
                    fontSize: "var(--body)",
                    lineHeight: 1.55,
                    fontWeight: 500,
                  }}
                >
                  {m.content}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div>
              <div
                style={{
                  background: "var(--peach-bg)",
                  border: "1.5px solid var(--peach-pastel)",
                  padding: "16px 20px",
                  display: "inline-flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    color: "var(--peach)",
                  }}
                >
                  Mulberry
                </div>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 7,
                        height: 7,
                        background: "var(--peach)",
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
      )}

      {/* Input bar */}
      <div
        style={{
          border: "2px solid var(--text)",
          display: "flex",
          background: "var(--card)",
          position: hasMessages ? "sticky" : "relative",
          bottom: hasMessages ? 20 : undefined,
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask anything about Macon-Bibb…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            padding: "16px 20px",
            fontSize: "var(--body)",
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
            borderLeft: "2px solid var(--text)",
            padding: "16px 22px",
            cursor: input.trim() && !loading ? "pointer" : "default",
            transition: "background 160ms ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: "var(--kicker)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "white",
            fontFamily: "inherit",
          }}
        >
          Ask
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="white" strokeWidth="1.8" strokeLinecap="square" />
          </svg>
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: "0.68rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--text-light)",
        }}
      >
        Powered by Gemma · Answers drawn from PeachTracker data
      </div>

      <style>{`
        @keyframes mulberry-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
