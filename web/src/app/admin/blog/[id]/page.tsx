import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BlogEditor } from "../blog-editor";

export default async function AdminBlogEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (!post) notFound();

  const { data: tagRows } = await supabase
    .from("blog_tags")
    .select("tag")
    .eq("post_id", id);

  const tags = (tagRows ?? []).map((r: { tag: string }) => r.tag);

  return <BlogEditor post={post} initialTags={tags} />;
}

export const dynamic = "force-dynamic";
