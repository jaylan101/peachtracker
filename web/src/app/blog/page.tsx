import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AccentBar, SiteNav, SiteFooter } from "@/components/site-chrome";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
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

export default async function BlogPage() {
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, title, slug, excerpt, cover_image, author, published_at, status")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const { data: allTags } = await supabase
    .from("blog_tags")
    .select("post_id, tag");

  const tagsByPost: Record<string, string[]> = {};
  (allTags ?? []).forEach((t: BlogTag) => {
    if (!tagsByPost[t.post_id]) tagsByPost[t.post_id] = [];
    tagsByPost[t.post_id].push(t.tag);
  });

  const published = posts ?? [];

  return (
    <>
      <AccentBar />
      <SiteNav />

      {/* Page header */}
      <div style={{ background: "var(--card)", borderBottom: "1.5px solid var(--border)" }}>
        <div
          style={{
            maxWidth: "var(--content)",
            margin: "0 auto",
            padding: "56px var(--gutter) 48px",
          }}
        >
          <p
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "var(--peach)",
              marginBottom: 10,
            }}
          >
            Macon-Bibb County
          </p>
          <h1
            style={{
              fontWeight: 900,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
              marginBottom: 16,
            }}
          >
            Civic Desk
          </h1>
          <p
            style={{
              fontSize: "var(--lead)",
              color: "var(--text-secondary)",
              fontWeight: 450,
              lineHeight: 1.55,
              maxWidth: 580,
            }}
          >
            Plain-language explainers on the races, decisions, and civic systems
            that shape Macon-Bibb — no spin, no sides.
          </p>
        </div>
      </div>

      {/* Posts grid */}
      <main
        style={{
          maxWidth: "var(--content)",
          margin: "0 auto",
          padding: "56px var(--gutter) 80px",
        }}
      >
        {published.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--body)" }}>
            No posts yet — check back soon.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: "1.5px",
              background: "var(--border)",
              border: "1.5px solid var(--border)",
            }}
          >
            {published.map((post: BlogPost) => (
              <PostCard
                key={post.id}
                post={post}
                tags={tagsByPost[post.id] ?? []}
              />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function PostCard({ post, tags }: { post: BlogPost; tags: string[] }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      style={{ textDecoration: "none", display: "block", background: "var(--card)" }}
    >
      {/* Cover image */}
      {post.cover_image ? (
        <div
          style={{
            height: 220,
            overflow: "hidden",
            borderBottom: "1.5px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.cover_image}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      ) : (
        <div
          style={{
            height: 220,
            background: "var(--peach-bg)",
            borderBottom: "1.5px solid var(--peach-pastel)",
            display: "flex",
            alignItems: "flex-end",
            padding: "20px 28px",
          }}
        >
          <span
            style={{
              fontWeight: 900,
              fontSize: "3.5rem",
              color: "var(--peach-pastel)",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            PT
          </span>
        </div>
      )}

      {/* Card body */}
      <div style={{ padding: "24px 28px 28px" }}>
        {/* Tags */}
        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
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
        <h2
          style={{
            fontWeight: 800,
            fontSize: "1.25rem",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            color: "var(--text)",
            marginBottom: 10,
          }}
        >
          {post.title}
        </h2>

        {/* Excerpt */}
        {post.excerpt && (
          <p
            style={{
              fontSize: "var(--body)",
              color: "var(--text-secondary)",
              lineHeight: 1.55,
              fontWeight: 450,
              marginBottom: 16,
            }}
          >
            {post.excerpt}
          </p>
        )}

        {/* Byline / date */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            borderTop: "1px solid var(--border)",
            paddingTop: 14,
            marginTop: "auto",
          }}
        >
          <span
            style={{
              fontSize: "var(--micro)",
              fontWeight: 600,
              color: "var(--text)",
              letterSpacing: "0.02em",
            }}
          >
            By {post.author}
          </span>
          {post.published_at && (
            <span
              style={{
                fontSize: "var(--micro)",
                color: "var(--text-light)",
                fontWeight: 500,
              }}
            >
              {formatDate(post.published_at)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const dynamic = "force-dynamic";
