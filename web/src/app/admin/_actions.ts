"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// -------- Auth --------

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !password) {
    redirect(`/admin/login?error=${encodeURIComponent("Email and password required")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/admin/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(next || "/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// -------- Vote updates (per-race) --------

export async function updateRaceVotes(formData: FormData) {
  const raceId = String(formData.get("race_id") ?? "");
  const electionId = String(formData.get("election_id") ?? "");
  const precinctsReporting = parseInt(
    String(formData.get("precincts_reporting") ?? "0"),
    10,
  );
  const totalPrecincts = parseInt(
    String(formData.get("total_precincts") ?? "0"),
    10,
  );
  const called = formData.get("called") === "on";
  const winner = String(formData.get("winner") ?? "").trim() || null;
  const snapshotNote = String(formData.get("snapshot_note") ?? "").trim() || null;

  const supabase = await createClient();

  // Update each candidate's vote count (fields named "votes:<candidate_id>")
  const candidateUpdates: Array<{ id: string; votes: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("votes:")) {
      const id = key.slice("votes:".length);
      const votes = parseInt(String(value), 10);
      if (!Number.isNaN(votes)) {
        candidateUpdates.push({ id, votes: Math.max(0, votes) });
      }
    }
  }

  // Apply candidate updates in parallel
  await Promise.all(
    candidateUpdates.map((c) =>
      supabase.from("candidates").update({ votes: c.votes }).eq("id", c.id),
    ),
  );

  // Update the race row
  await supabase
    .from("races")
    .update({
      precincts_reporting: isFinite(precinctsReporting) ? precinctsReporting : 0,
      total_precincts: isFinite(totalPrecincts) ? totalPrecincts : 0,
      called,
      winner: called ? winner : null,
    })
    .eq("id", raceId);

  // Write a snapshot row per candidate for the timeline
  const { data: race } = await supabase
    .from("races")
    .select("id, precincts_reporting")
    .eq("id", raceId)
    .maybeSingle();

  if (race) {
    const snapshotRows = candidateUpdates.map((c) => ({
      race_id: raceId,
      candidate_id: c.id,
      votes: c.votes,
      precincts_reporting: race.precincts_reporting,
      note: snapshotNote,
    }));
    if (snapshotRows.length > 0) {
      await supabase.from("result_snapshots").insert(snapshotRows);
    }
  }

  // Bump the election's last_updated stamp
  if (electionId) {
    const now = new Date();
    const hhmm = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
    await supabase
      .from("elections")
      .update({ last_updated: hhmm })
      .eq("id", electionId);
  }

  revalidatePath(`/admin/elections/${electionId}`);
  revalidatePath(`/elections/${electionId}`);
  revalidatePath("/");
}

// -------- Election settings --------

export async function updateElectionSettings(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "upcoming");
  const lastUpdated = String(formData.get("last_updated") ?? "").trim() || null;

  const supabase = await createClient();
  await supabase
    .from("elections")
    .update({ status, last_updated: lastUpdated })
    .eq("id", id);

  revalidatePath(`/admin/elections/${id}`);
  revalidatePath(`/elections/${id}`);
  revalidatePath("/");
}

// -------- Change password --------

export async function changePassword(formData: FormData) {
  const newPassword = String(formData.get("new_password") ?? "");
  if (newPassword.length < 8) {
    redirect(
      `/admin/account?error=${encodeURIComponent("Password must be at least 8 characters")}`,
    );
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    redirect(`/admin/account?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/account?ok=1");
}
