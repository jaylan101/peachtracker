import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";
import type { Metadata } from "next";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  cover_image: string | null;
  author: string;
  published_at: string | null;
  status: string;
}

interface BlogTag {
  post_id: string;
  tag: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("title, excerpt, cover_image")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!post) return {};

  return {
    title: `${post.title} — PeachTracker`,
    description: post.excerpt ?? undefined,
    openGraph: post.cover_image
      ? { images: [{ url: post.cover_image, width: 1200, height: 630 }] }
      : {},
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!post) notFound();

  const { data: tagRows } = await supabase
    .from("blog_tags")
    .select("tag")
    .eq("post_id", post.id);

  const tags = (tagRows ?? []).map((r: { tag: string }) => r.tag);

  // Fetch 3 other recent posts for "More from Civic Desk"
  const { data: related } = await supabase
    .from("blog_posts")
    .select("id, title, slug, excerpt, published_at, author")
    .eq("status", "published")
    .neq("id", post.id)
    .order("published_at", { ascending: false })
    .limit(3);

  return (
    <>
      <AccentBar />
      <SiteNav />

      <article>
        {/* Article header */}
        <div
          style={{
            background: "var(--card)",
            borderBottom: "1.5px solid var(--border)",
          }}
        >
          <div
            style={{
              maxWidth: 760,
              margin: "0 auto",
              padding: "56px var(--gutter) 48px",
            }}
          >
            {/* Back link */}
            <Link
              href="/blog"
              style={{
                fontSize: "var(--kicker)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "var(--peach)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 28,
              }}
            >
              ← Civic Desk
            </Link>

            {/* Tags */}
            {tags.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                {tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.14em",
                      color: "var(--peach)",
                      background: "var(--peach-bg)",
                      border: "1px solid var(--peach-pastel)",
                      padding: "3px 8px",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Title */}
            <h1
              style={{
                fontWeight: 900,
                fontSize: "clamp(1.9rem, 4vw, 2.8rem)",
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
                color: "var(--text)",
                marginBottom: 20,
              }}
            >
              {post.title}
            </h1>

            {/* Byline strip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                paddingTop: 16,
                borderTop: "1.5px solid var(--border)",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 42,
                  height: 42,
                  background: "var(--peach)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontWeight: 900,
                    fontSize: "0.9rem",
                    color: "#fff",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {initials(post.author)}
                </span>
              </div>
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "var(--body)",
                    color: "var(--text)",
                    lineHeight: 1.2,
                  }}
                >
                  {post.author}
                </div>
                {post.published_at && (
                  <div
                    style={{
                      fontSize: "var(--micro)",
                      color: "var(--text-light)",
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                  >
                    {formatDate(post.published_at)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cover image */}
        {post.cover_image && (
          <div
            style={{
              maxWidth: 760,
              margin: "0 auto",
              borderBottom: "1.5px solid var(--border)",
              borderLeft: "1.5px solid var(--border)",
              borderRight: "1.5px solid var(--border)",
              overflow: "hidden",
              height: 400,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.cover_image}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        )}

        {/* Article body */}
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "48px var(--gutter) 80px",
          }}
        >
          <div className="prose-body">
            {renderContent(post.content)}
          </div>
        </div>
      </article>

      {/* More from Civic Desk */}
      {(related ?? []).length > 0 && (
        <div
          style={{
            borderTop: "2px solid var(--text)",
            background: "var(--bg)",
          }}
        >
          <div
            style={{
              maxWidth: "var(--content)",
              margin: "0 auto",
              padding: "48px var(--gutter) 64px",
            }}
          >
            <div
              style={{
                fontSize: "var(--kicker)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "var(--text-secondary)",
                borderTop: "1.5px solid var(--border)",
                paddingTop: 12,
                marginBottom: 20,
              }}
            >
              More from Civic Desk
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "1.5px",
                background: "var(--border)",
                border: "1.5px solid var(--border)",
              }}
            >
              {(related ?? []).map((r) => (
                <Link
                  key={r.id}
                  href={`/blog/${r.slug}`}
                  style={{
                    background: "var(--card)",
                    padding: "20px 24px",
                    textDecoration: "none",
                    display: "block",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "1rem",
                      letterSpacing: "-0.015em",
                      color: "var(--text)",
                      lineHeight: 1.25,
                      marginBottom: 8,
                    }}
                  >
                    {r.title}
                  </div>
                  {r.excerpt && (
                    <div
                      style={{
                        fontSize: "var(--micro)",
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                        fontWeight: 450,
                        marginBottom: 12,
                      }}
                    >
                      {r.excerpt}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "var(--micro)",
                      color: "var(--text-light)",
                      fontWeight: 500,
                    }}
                  >
                    By {r.author}
                    {r.published_at ? ` · ${formatDate(r.published_at)}` : ""}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </>
  );
}

// Very simple markdown-ish renderer — handles paragraphs, headers, bold, blockquotes
function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} style={{
          fontWeight: 800,
          fontSize: "1.35rem",
          letterSpacing: "-0.02em",
          color: "var(--text)",
          marginTop: 40,
          marginBottom: 12,
          lineHeight: 1.2,
        }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} style={{
          fontWeight: 700,
          fontSize: "1.1rem",
          letterSpacing: "-0.01em",
          color: "var(--text)",
          marginTop: 32,
          marginBottom: 10,
        }}>
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} style={{
          borderLeft: "4px solid var(--peach)",
          paddingLeft: 20,
          margin: "28px 0",
          color: "var(--text-secondary)",
          fontStyle: "italic",
          fontSize: "1.05rem",
          lineHeight: 1.6,
        }}>
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
    } else if (line.trim() === "") {
      // skip blank lines — spacing handled by margin
    } else {
      elements.push(
        <p key={i} style={{
          fontSize: "1.05rem",
          lineHeight: 1.7,
          color: "var(--text)",
          fontWeight: 450,
          marginBottom: 18,
        }}>
          {inlineFormat(line)}
        </p>
      );
    }
    i++;
  }

  return elements;
}

function inlineFormat(text: string): React.ReactNode {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 700, color: "var(--text)" }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const dynamic = "force-dynamic";
