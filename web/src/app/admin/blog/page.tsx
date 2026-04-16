import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  status: string;
  author: string;
  published_at: string | null;
  updated_at: string;
}

export default async function AdminBlogPage() {
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, title, slug, status, author, published_at, updated_at")
    .order("updated_at", { ascending: false });

  const allPosts = posts ?? [];
  const published = allPosts.filter((p: BlogPost) => p.status === "published");
  const drafts = allPosts.filter((p: BlogPost) => p.status === "draft");

  return (
    <main className="admin-shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
        <div>
          <h1 className="admin-h1">Civic Desk</h1>
          <p className="admin-sub">Write and publish explainers, race previews, and civic context.</p>
        </div>
        <Link href="/admin/blog/new" className="admin-btn">
          + New post
        </Link>
      </div>

      {allPosts.length === 0 && (
        <div className="admin-card" style={{ color: "var(--text-secondary)" }}>
          No posts yet. Hit "New post" to get started.
        </div>
      )}

      {drafts.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.14em",
              color: "var(--text-secondary)",
              borderTop: "1.5px solid var(--border)",
              paddingTop: 10,
              marginBottom: 12,
            }}
          >
            Drafts
          </div>
          {drafts.map((post: BlogPost) => (
            <PostRow key={post.id} post={post} />
          ))}
        </section>
      )}

      {published.length > 0 && (
        <section>
          <div
            style={{
              fontSize: "var(--kicker)",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.14em",
              color: "var(--text-secondary)",
              borderTop: "1.5px solid var(--border)",
              paddingTop: 10,
              marginBottom: 12,
            }}
          >
            Published
          </div>
          {published.map((post: BlogPost) => (
            <PostRow key={post.id} post={post} />
          ))}
        </section>
      )}

      <div style={{ marginTop: 32 }}>
        <Link href="/admin" className="admin-btn admin-btn-ghost">← Dashboard</Link>
      </div>
    </main>
  );
}

function PostRow({ post }: { post: BlogPost }) {
  return (
    <div className="admin-card" style={{ marginBottom: 0 }}>
      <div className="admin-card-h">
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.6rem",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.14em",
              color: post.status === "published" ? "var(--green)" : "var(--text-light)",
              marginBottom: 4,
            }}
          >
            {post.status}
          </div>
          <div className="admin-card-title" style={{ marginBottom: 4 }}>{post.title}</div>
          <div className="admin-card-meta">
            By {post.author}
            {post.published_at
              ? ` · Published ${formatDate(post.published_at)}`
              : ` · Updated ${formatDate(post.updated_at)}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {post.status === "published" && (
            <Link
              href={`/blog/${post.slug}`}
              className="admin-btn admin-btn-ghost"
              prefetch={false}
            >
              View
            </Link>
          )}
          <Link href={`/admin/blog/${post.id}`} className="admin-btn">
            Edit →
          </Link>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const dynamic = "force-dynamic";
