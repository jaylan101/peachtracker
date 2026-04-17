"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  cover_image: string | null;
  author: string;
  status: string;
  published_at: string | null;
}

interface Props {
  post: BlogPost | null;
  initialTags: string[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function BlogEditor({ post, initialTags }: Props) {
  const router = useRouter();
  const isNew = !post;

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugManual, setSlugManual] = useState(!!post?.slug);
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [author, setAuthor] = useState(post?.author ?? "Jaylan Scott");
  const [coverImage, setCoverImage] = useState(post?.cover_image ?? "");
  const [status, setStatus] = useState<"draft" | "published">(
    (post?.status as "draft" | "published") ?? "draft"
  );
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(initialTags);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-generate slug from title for new posts
  function handleTitleChange(val: string) {
    setTitle(val);
    if (!slugManual) {
      setSlug(slugify(val));
    }
  }

  function handleSlugChange(val: string) {
    setSlug(slugify(val));
    setSlugManual(true);
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from("blog-covers")
        .upload(fileName, file, { upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from("blog-covers")
        .getPublicUrl(fileName);
      setCoverImage(urlData.publicUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(publish?: boolean) {
    if (!title.trim() || !slug.trim() || !content.trim()) {
      setSaveMsg("Title, slug, and content are required.");
      return;
    }
    setSaving(true);
    setSaveMsg("");
    const supabase = createClient();

    const finalStatus = publish !== undefined ? (publish ? "published" : "draft") : status;
    const now = new Date().toISOString();

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      content: content.trim(),
      excerpt: excerpt.trim() || null,
      cover_image: coverImage.trim() || null,
      author: author.trim() || "Jaylan Scott",
      status: finalStatus,
      published_at:
        finalStatus === "published"
          ? (post?.published_at ?? now)
          : null,
      updated_at: now,
    };

    let postId = post?.id;

    if (isNew) {
      const { data, error } = await supabase
        .from("blog_posts")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        setSaveMsg("Error: " + error.message);
        setSaving(false);
        return;
      }
      postId = data.id;
    } else {
      const { error } = await supabase
        .from("blog_posts")
        .update(payload)
        .eq("id", post!.id);
      if (error) {
        setSaveMsg("Error: " + error.message);
        setSaving(false);
        return;
      }
    }

    // Sync tags — delete existing, re-insert
    await supabase.from("blog_tags").delete().eq("post_id", postId!);
    if (tags.length > 0) {
      await supabase
        .from("blog_tags")
        .insert(tags.map((tag) => ({ post_id: postId!, tag })));
    }

    if (publish !== undefined) setStatus(finalStatus);

    setSaveMsg(publish ? "Published!" : "Saved.");
    setSaving(false);

    if (isNew) {
      router.push(`/admin/blog/${postId}`);
    }
  }

  return (
    <main className="admin-shell" style={{ maxWidth: 840 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, gap: 16 }}>
        <div>
          <Link href="/admin/blog" className="admin-btn admin-btn-ghost" style={{ fontSize: "0.78rem", padding: "6px 14px" }}>
            ← Civic Desk
          </Link>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saveMsg && (
            <span style={{ fontSize: "var(--micro)", color: saveMsg.startsWith("Error") ? "var(--peach)" : "var(--green)", fontWeight: 600 }}>
              {saveMsg}
            </span>
          )}
          <button className="admin-btn admin-btn-ghost" onClick={() => handleSave(false)} disabled={saving}>
            Save draft
          </button>
          {status !== "published" ? (
            <button className="admin-btn" onClick={() => handleSave(true)} disabled={saving}>
              Publish →
            </button>
          ) : (
            <button className="admin-btn" onClick={() => handleSave()} disabled={saving}>
              Save changes
            </button>
          )}
        </div>
      </div>

      <h1 className="admin-h1" style={{ marginBottom: 28 }}>
        {isNew ? "New post" : "Edit post"}
      </h1>

      {/* Status badge */}
      <div style={{ marginBottom: 24 }}>
        <span style={{
          fontSize: "0.62rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          padding: "4px 10px",
          background: status === "published" ? "var(--green-bg)" : "var(--bg)",
          border: `1px solid ${status === "published" ? "var(--green-pastel)" : "var(--border)"}`,
          color: status === "published" ? "var(--green)" : "var(--text-light)",
        }}>
          {status === "published" ? "Published" : "Draft"}
        </span>
        {status === "published" && (
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{
              marginLeft: 10,
              fontSize: "0.62rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            Unpublish
          </button>
        )}
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        {/* Title */}
        <Field label="Title *">
          <input
            className="admin-input"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="What's at stake in BOE Post 7"
            style={{ fontSize: "1.1rem", fontWeight: 700 }}
          />
        </Field>

        {/* Slug */}
        <Field label="URL slug *" hint={slug ? `peachtracker.vercel.app/blog/${slug}` : ""}>
          <input
            className="admin-input"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="whats-at-stake-boe-post-7"
            style={{ fontFamily: "monospace", fontSize: "0.88rem" }}
          />
        </Field>

        {/* Author */}
        <Field label="Author">
          <input
            className="admin-input"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Jaylan Scott"
          />
        </Field>

        {/* Excerpt */}
        <Field label="Excerpt" hint="One or two sentences shown on the blog list page.">
          <textarea
            className="admin-input"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            placeholder="A short summary readers see before clicking in."
            style={{ resize: "vertical" }}
          />
        </Field>

        {/* Tags */}
        <Field label="Tags">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--peach)",
                  background: "var(--peach-bg)",
                  border: "1px solid var(--peach-pastel)",
                  padding: "3px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
                onClick={() => removeTag(tag)}
                title="Click to remove"
              >
                {tag} ×
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="admin-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Elections, Explainer, Commission…"
              style={{ flex: 1 }}
            />
            <button className="admin-btn admin-btn-ghost" type="button" onClick={addTag}>
              Add
            </button>
          </div>
          <p style={{ fontSize: "var(--micro)", color: "var(--text-light)", marginTop: 6 }}>
            Press Enter or Add. Click a tag to remove it.
          </p>
        </Field>

        {/* Cover image */}
        <Field label="Cover image" hint="Upload a photo or paste a URL.">
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              className="admin-input"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://… or upload below"
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="admin-btn admin-btn-ghost"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Upload image"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageUpload}
            />
            {uploadError && (
              <span style={{ fontSize: "var(--micro)", color: "var(--peach)", fontWeight: 600 }}>
                {uploadError}
              </span>
            )}
          </div>
          {coverImage && (
            <div style={{ marginTop: 12, border: "1.5px solid var(--border)", overflow: "hidden", maxHeight: 200 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImage} alt="" style={{ width: "100%", objectFit: "cover", display: "block", maxHeight: 200 }} />
            </div>
          )}
        </Field>

        {/* Content */}
        <Field
          label="Content *"
          hint="Markdown supported: ## Heading, **bold**, > blockquote. Each line is a paragraph."
        >
          <textarea
            className="admin-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={28}
            placeholder={`## What's happening\n\nWrite your explainer here. Use ## for section headers, **bold** for emphasis, and > for pull quotes.\n\n## Why it matters\n\nKeep it factual, local, and clear.`}
            style={{
              resize: "vertical",
              fontFamily: "monospace",
              fontSize: "0.88rem",
              lineHeight: 1.6,
            }}
          />
        </Field>
      </div>

      {/* Bottom save bar */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 20,
          borderTop: "1.5px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Link href="/admin/blog" className="admin-btn admin-btn-ghost">
          ← All posts
        </Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saveMsg && (
            <span style={{ fontSize: "var(--micro)", color: saveMsg.startsWith("Error") ? "var(--peach)" : "var(--green)", fontWeight: 600 }}>
              {saveMsg}
            </span>
          )}
          <button className="admin-btn admin-btn-ghost" onClick={() => handleSave(false)} disabled={saving}>
            Save draft
          </button>
          {status !== "published" ? (
            <button className="admin-btn" onClick={() => handleSave(true)} disabled={saving}>
              Publish →
            </button>
          ) : (
            <button className="admin-btn" onClick={() => handleSave()} disabled={saving}>
              Save changes
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "var(--kicker)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--text-secondary)",
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      {hint && (
        <p style={{ fontSize: "var(--micro)", color: "var(--text-light)", marginBottom: 8, fontWeight: 500 }}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}
