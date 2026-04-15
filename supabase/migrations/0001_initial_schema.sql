-- PeachTracker — Initial schema
-- Run this once in the Supabase SQL editor on a fresh project.
-- Creates 11 tables across 3 domains (elections, commission, blog),
-- adds indexes, enables RLS with public-read / authenticated-write policies,
-- and registers the realtime publication for live election updates.

-- =============================================================================
-- 1. ELECTIONS DOMAIN
-- =============================================================================

create table if not exists elections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  election_date date not null,
  location text not null default 'Macon-Bibb County',
  status text not null default 'upcoming'
    check (status in ('upcoming', 'live', 'final', 'certified')),
  total_precincts integer not null,
  last_updated text,
  created_at timestamptz not null default now()
);

create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references elections(id) on delete cascade,
  name text not null,
  category text not null,
  type text not null check (type in ('nonpartisan', 'democratic', 'republican')),
  precincts_reporting integer not null default 0,
  total_precincts integer not null,
  called boolean not null default false,
  winner text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races(id) on delete cascade,
  name text not null,
  incumbent boolean not null default false,
  party text,
  votes integer not null default 0,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists result_snapshots (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  votes integer not null,
  precincts_reporting integer not null,
  note text,
  recorded_at timestamptz not null default now()
);

create table if not exists unopposed_races (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references elections(id) on delete cascade,
  name text not null,
  type text not null check (type in ('nonpartisan', 'democratic', 'republican')),
  candidate_name text not null,
  incumbent boolean not null default false,
  sort_order integer not null default 0
);

-- =============================================================================
-- 2. COMMISSION TRACKER DOMAIN
-- =============================================================================

create table if not exists commissioners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null,
  image_url text,
  term_start date,
  term_end date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  meeting_type text not null default 'regular'
    check (meeting_type in ('regular', 'special', 'committee', 'work_session')),
  agenda_url text,
  minutes_url text,
  created_at timestamptz not null default now()
);

create table if not exists agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  item_number integer not null,
  title text not null,
  summary_eli5 text,
  category text check (category in (
    'public_safety', 'zoning', 'budget', 'infrastructure',
    'education', 'housing', 'economic_development',
    'parks_recreation', 'administrative', 'other'
  )),
  full_text text,
  created_at timestamptz not null default now()
);

create table if not exists commission_votes (
  id uuid primary key default gen_random_uuid(),
  agenda_item_id uuid not null references agenda_items(id) on delete cascade,
  commissioner_id uuid not null references commissioners(id) on delete cascade,
  vote text not null check (vote in ('yes', 'no', 'abstain', 'absent')),
  notes text,
  created_at timestamptz not null default now(),
  unique (agenda_item_id, commissioner_id)
);

-- =============================================================================
-- 3. BLOG DOMAIN
-- =============================================================================

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  content text not null,
  excerpt text,
  cover_image text,
  author text not null default 'PeachTracker',
  published_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references blog_posts(id) on delete cascade,
  tag text not null
);

-- keep blog_posts.updated_at fresh on any update
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_posts_set_updated_at on blog_posts;
create trigger blog_posts_set_updated_at
  before update on blog_posts
  for each row execute function set_updated_at();

-- =============================================================================
-- 4. INDEXES
-- =============================================================================

create index if not exists idx_races_election on races(election_id);
create index if not exists idx_candidates_race on candidates(race_id);
create index if not exists idx_result_snapshots_race on result_snapshots(race_id);
create index if not exists idx_result_snapshots_recorded on result_snapshots(recorded_at);
create index if not exists idx_agenda_items_meeting on agenda_items(meeting_id);
create index if not exists idx_agenda_items_category on agenda_items(category);
create index if not exists idx_commission_votes_item on commission_votes(agenda_item_id);
create index if not exists idx_commission_votes_commissioner on commission_votes(commissioner_id);
create index if not exists idx_blog_posts_slug on blog_posts(slug);
create index if not exists idx_blog_posts_status on blog_posts(status);
create index if not exists idx_blog_tags_tag on blog_tags(tag);
create index if not exists idx_blog_tags_post on blog_tags(post_id);
create index if not exists idx_unopposed_election on unopposed_races(election_id);

-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

alter table elections enable row level security;
alter table races enable row level security;
alter table candidates enable row level security;
alter table result_snapshots enable row level security;
alter table unopposed_races enable row level security;
alter table commissioners enable row level security;
alter table meetings enable row level security;
alter table agenda_items enable row level security;
alter table commission_votes enable row level security;
alter table blog_posts enable row level security;
alter table blog_tags enable row level security;

-- Public read policies
drop policy if exists "Public read" on elections;
create policy "Public read" on elections for select using (true);

drop policy if exists "Public read" on races;
create policy "Public read" on races for select using (true);

drop policy if exists "Public read" on candidates;
create policy "Public read" on candidates for select using (true);

drop policy if exists "Public read" on result_snapshots;
create policy "Public read" on result_snapshots for select using (true);

drop policy if exists "Public read" on unopposed_races;
create policy "Public read" on unopposed_races for select using (true);

drop policy if exists "Public read" on commissioners;
create policy "Public read" on commissioners for select using (true);

drop policy if exists "Public read" on meetings;
create policy "Public read" on meetings for select using (true);

drop policy if exists "Public read" on agenda_items;
create policy "Public read" on agenda_items for select using (true);

drop policy if exists "Public read" on commission_votes;
create policy "Public read" on commission_votes for select using (true);

drop policy if exists "Public read published" on blog_posts;
create policy "Public read published" on blog_posts
  for select using (status = 'published');

drop policy if exists "Public read" on blog_tags;
create policy "Public read" on blog_tags for select using (true);

-- Admin write policies (any authenticated user)
drop policy if exists "Admin write" on elections;
create policy "Admin write" on elections for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on races;
create policy "Admin write" on races for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on candidates;
create policy "Admin write" on candidates for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on result_snapshots;
create policy "Admin write" on result_snapshots for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on unopposed_races;
create policy "Admin write" on unopposed_races for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on commissioners;
create policy "Admin write" on commissioners for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on meetings;
create policy "Admin write" on meetings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on agenda_items;
create policy "Admin write" on agenda_items for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on commission_votes;
create policy "Admin write" on commission_votes for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on blog_posts;
create policy "Admin write" on blog_posts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin write" on blog_tags;
create policy "Admin write" on blog_tags for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- =============================================================================
-- 6. REALTIME PUBLICATION
-- =============================================================================
-- Guard: only add tables that aren't already in the publication, so re-runs
-- don't error.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'candidates'
  ) then
    alter publication supabase_realtime add table candidates;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'races'
  ) then
    alter publication supabase_realtime add table races;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'elections'
  ) then
    alter publication supabase_realtime add table elections;
  end if;
end;
$$;
