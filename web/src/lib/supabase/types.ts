// Hand-written types that mirror the schema in
// supabase/migrations/0001_initial_schema.sql.
// Eventually replace this with `supabase gen types typescript --project-id <id>`.

export type ElectionStatus = "upcoming" | "live" | "final" | "certified";
export type RaceType = "nonpartisan" | "democratic" | "republican";
export type MeetingType = "regular" | "special" | "committee" | "work_session";
export type VoteChoice = "yes" | "no" | "abstain" | "absent";
export type BlogStatus = "draft" | "published";

export interface Election {
  id: string;
  name: string;
  election_date: string; // ISO date
  location: string;
  status: ElectionStatus;
  total_precincts: number;
  last_updated: string | null;
  created_at: string;
}

export interface Race {
  id: string;
  election_id: string;
  name: string;
  category: string;
  type: RaceType;
  precincts_reporting: number;
  total_precincts: number;
  called: boolean;
  winner: string | null;
  sort_order: number;
  created_at: string;
}

export interface Candidate {
  id: string;
  race_id: string;
  name: string;
  incumbent: boolean;
  party: string | null;
  votes: number;
  image_url: string | null;
  sort_order: number;
  created_at: string;
}

export interface ResultSnapshot {
  id: string;
  race_id: string;
  candidate_id: string;
  votes: number;
  precincts_reporting: number;
  note: string | null;
  recorded_at: string;
}

export interface UnopposedRace {
  id: string;
  election_id: string;
  name: string;
  type: RaceType;
  candidate_name: string;
  incumbent: boolean;
  sort_order: number;
}

export interface Commissioner {
  id: string;
  name: string;
  district: string;
  image_url: string | null;
  term_start: string | null;
  term_end: string | null;
  active: boolean;
  created_at: string;
}

export interface Meeting {
  id: string;
  meeting_date: string;
  meeting_type: MeetingType;
  agenda_url: string | null;
  minutes_url: string | null;
  created_at: string;
}

export interface AgendaItem {
  id: string;
  meeting_id: string;
  item_number: number;
  title: string;
  summary_eli5: string | null;
  // True once an admin has manually edited the summary. Protects the row from
  // being overwritten by the Gemini regen or Claude-driven backfill paths.
  summary_edited: boolean;
  category: string | null;
  full_text: string | null;
  created_at: string;
}

export interface CommissionVote {
  id: string;
  agenda_item_id: string;
  commissioner_id: string;
  vote: VoteChoice;
  notes: string | null;
  created_at: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  cover_image: string | null;
  author: string;
  published_at: string | null;
  status: BlogStatus;
  created_at: string;
  updated_at: string;
}

export interface BlogTag {
  id: string;
  post_id: string;
  tag: string;
}

// Convenience composite used on the election results view
export interface RaceWithCandidates extends Race {
  candidates: Candidate[];
}
