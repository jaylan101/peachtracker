"use client";

import { useState, useRef, useEffect } from "react";
import { AccentBar, SiteNav } from "@/components/site-chrome";

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

export function MulberryAskPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeGroup, setActiveGroup] = useState(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll messages to bottom on new content
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // When keyboard opens on iOS, scroll messages to bottom so latest stays visible
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onFocus = () => {
      setTimeout(() => {
        if (messagesRef.current) {
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
      }, 350); // wait for keyboard animation
    };
    input.addEventListener("focus", onFocus);
    return () => input.removeEventListener("focus", onFocus);
  }, []);

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
    <>
      {/*
       * The entire page is a fixed full-screen layout.
       * When the iOS keyboard appears, it resizes the visual viewport but
       * this container stays fixed — the browser cannot scroll the page body.
       * Only messagesRef scrolls internally.
       *
       * dvh = dynamic viewport height (shrinks when keyboard opens)
       */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          zIndex: 0,
        }}
      >
        {/* Site chrome */}
        <div style={{ flexShrink: 0 }}>
          <AccentBar />
          <SiteNav />
        </div>

        {/* Compact header */}
        <div
          style={{
            flexShrink: 0,
            background: "var(--text)",
            borderBottom: "2px solid var(--text)",
            padding: "16px var(--gutter)",
          }}
        >
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1
              style={{
                fontWeight: 900,
                fontSize: "clamp(1.2rem, 3vw, 1.8rem)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                color: "white",
                margin: 0,
              }}
            >
              Ask <span style={{ color: "var(--peach)" }}>Mulberry</span>
            </h1>
            <span
              style={{
                fontSize: "var(--kicker)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              Macon-Bibb Civic AI
            </span>
          </div>
        </div>

        {/* Scrollable messages area — the ONLY thing that scrolls */}
        <div
          ref={messagesRef}
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
            minHeight: 0,
          }}
        >
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px var(--gutter) 12px" }}>

            {/* Suggested topics */}
            {!hasMessages && (
              <div>
                <div
                  style={{
                    display: "flex",
                    borderBottom: "2px solid var(--text)",
                    marginBottom: 16,
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
                        padding: "10px 16px",
                        fontSize: "var(--kicker)",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: i === activeGroup ? "var(--peach)" : "var(--text-secondary)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

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
                        WebkitTapHighlightColor: "transparent",
                      }}
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
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
                          padding: "14px 18px",
                          maxWidth: "88%",
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
                        <div style={{ fontSize: "var(--body)", lineHeight: 1.65, color: "var(--text)" }}>
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          background: "var(--text)",
                          color: "white",
                          padding: "12px 16px",
                          maxWidth: "75%",
                          fontSize: "var(--body)",
                          lineHeight: 1.5,
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
                        padding: "14px 18px",
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
              </div>
            )}
          </div>
        </div>

        {/* Input bar — pinned to bottom, never scrolls */}
        <div style={{ flexShrink: 0, borderTop: "2px solid var(--text)" }}>
          <div
            style={{
              maxWidth: 760,
              margin: "0 auto",
              padding: "12px var(--gutter)",
            }}
          >
            <div
              style={{
                border: "2px solid var(--text)",
                display: "flex",
                background: "var(--card)",
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
                  padding: "14px 16px",
                  fontSize: "16px", // must be 16px to prevent iOS zoom
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
                  padding: "14px 20px",
                  cursor: input.trim() && !loading ? "pointer" : "default",
                  transition: "background 160ms ease",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "var(--kicker)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "white",
                  fontFamily: "inherit",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                Ask
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M1 7H13M13 7L8 2M13 7L8 12" stroke="white" strokeWidth="1.8" strokeLinecap="square" />
                </svg>
              </button>
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: "0.65rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-light)",
              }}
            >
              Powered by Llama · Answers drawn from PeachTracker data
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes mulberry-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}

// Keep old export for floating chat bubble (mulberry-chat.tsx imports nothing from here,
// but if anything imports MulberryFullPage we alias it)
export { MulberryAskPage as MulberryFullPage };
