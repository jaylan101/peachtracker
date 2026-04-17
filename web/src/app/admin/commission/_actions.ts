"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addAgendaItem(formData: FormData) {
  const meetingId = String(formData.get("meeting_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const summary = String(formData.get("summary_eli5") ?? "").trim() || null;

  if (!meetingId || !title) return;

  const supabase = await createClient();

  // Get next item number for this meeting
  const { count } = await supabase
    .from("agenda_items")
    .select("*", { count: "exact", head: true })
    .eq("meeting_id", meetingId);

  await supabase.from("agenda_items").insert({
    meeting_id: meetingId,
    item_number: (count ?? 0) + 1,
    title,
    category,
    summary_eli5: summary,
  });

  revalidatePath("/admin/commission");
  revalidatePath("/commission");
}

export async function addVote(formData: FormData) {
  const agendaItemId = String(formData.get("agenda_item_id") ?? "");
  const commissionerId = String(formData.get("commissioner_id") ?? "");
  const vote = String(formData.get("vote") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!agendaItemId || !commissionerId || !vote) return;

  const supabase = await createClient();
  await supabase
    .from("commission_votes")
    .upsert(
      { agenda_item_id: agendaItemId, commissioner_id: commissionerId, vote, notes },
      { onConflict: "agenda_item_id,commissioner_id" },
    );

  revalidatePath("/admin/commission");
  revalidatePath("/commission");
}
