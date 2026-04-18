"use server";

// Server actions for /admin/explainers — manage summary_eli5 on agenda_items.
//
// Three actions:
//   - saveExplainer: admin edits the summary inline → sets summary_edited=true
//     so future regen/backfill won't overwrite the hand-tuned version.
//   - regenerateExplainer: admin clicks "Regenerate" → re-runs generateExplainer
//     against the current title + full_text, writes result back. Does NOT flip
//     summary_edited (it's still a machine-generated summary).
//   - clearExplainer: rare escape hatch — wipe the summary, unmark edited, so
//     the next sync or regen can repopulate it fresh.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateExplainer } from "@/lib/civicclerk/generate-explainer";

function isAdminGuard(result: unknown): result is true {
  return result === true;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdminGuard(isAdmin)) throw new Error("Forbidden");
  return supabase;
}

export async function saveExplainer(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();
  if (!id) return;

  const supabase = await requireAdmin();

  // Empty summary is valid — the admin may want to hide it entirely for a
  // truly boilerplate item. Either way, mark as edited so regen won't stomp.
  await supabase
    .from("agenda_items")
    .update({
      summary_eli5: summary || null,
      summary_edited: true,
    })
    .eq("id", id);

  revalidatePath("/admin/explainers");
  revalidatePath("/commission");
}

export async function regenerateExplainer(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await requireAdmin();

  const { data: item } = await supabase
    .from("agenda_items")
    .select("id, title, full_text, summary_edited")
    .eq("id", id)
    .maybeSingle();
  if (!item) return;

  // Safety: if admin has manually edited it, don't silently overwrite. The
  // Regenerate button is hidden for edited rows, but belt-and-suspenders.
  if (item.summary_edited) return;

  const { summary } = await generateExplainer({ title: item.title, fullText: item.full_text });
  if (!summary) return;

  await supabase
    .from("agenda_items")
    .update({ summary_eli5: summary })
    .eq("id", id)
    .eq("summary_edited", false);

  revalidatePath("/admin/explainers");
  revalidatePath("/commission");
}

export async function clearExplainer(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await requireAdmin();

  await supabase
    .from("agenda_items")
    .update({ summary_eli5: null, summary_edited: false })
    .eq("id", id);

  revalidatePath("/admin/explainers");
  revalidatePath("/commission");
}
