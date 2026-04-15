-- PeachTracker — Seed data
-- Run this AFTER 0001_initial_schema.sql on a fresh project.
-- Seeds:
--   1. The May 19, 2026 Georgia Primary (8 contested + 8 unopposed races)
--   2. The April 14, 2026 District 5 Special Election Runoff (certified, with full timeline)
-- Safe to re-run on a database that already has these rows: uses CTEs keyed by
-- election_date + name, and ON CONFLICT guards where unique keys exist.
-- If re-running, first truncate cleanly: TRUNCATE elections CASCADE;

-- =============================================================================
-- 1. MAY 19, 2026 PRIMARY — elections + races + candidates + unopposed
-- =============================================================================

with may_election as (
  insert into elections (name, election_date, location, status, total_precincts, last_updated)
  values ('Georgia Primary & Nonpartisan General', '2026-05-19', 'Macon-Bibb County', 'upcoming', 38, null)
  returning id
),

-- contested races
race_boe7 as (
  insert into races (election_id, name, category, type, total_precincts, sort_order)
  select id, 'Board of Education Post 7 (At-Large)', 'Board of Education', 'nonpartisan', 38, 10 from may_election
  returning id
),
race_boe8 as (
  insert into races (election_id, name, category, type, total_precincts, sort_order)
  select id, 'Board of Education Post 8 (At-Large)', 'Board of Education', 'nonpartisan', 38, 20 from may_election
  returning id
),
race_water_atlarge as (
  insert into races (election_id, name, category, type, total_precincts, sort_order)
  select id, 'Water Authority At-Large', 'Water Authority', 'nonpartisan', 38, 30 from may_election
  returning id
),
race_water_d2 as (
  insert into races (election_id, name, category, type, total_precincts, sort_order)
  select id, 'Water Authority District 2', 'Water Authority', 'nonpartisan', 6, 40 from may_election
  returning id
),
race_water_d4 as (
  insert into races (election_id, name, category, type, total_precincts, sort_order)
  select id, 'Water Authority District 4', 'Water Authority', 'nonpartisan', 6, 50 from may_election
  returning id
),
race_house_142 as (
  insert into races (election_id, name, category, type, total_precincts, sort_order)
  select id, 'State House District 142', 'State Legislature', 'democratic', 10, 60 from may_election
  returning id
),
race_senate_18 as (
  insert into races (election_id, name, category, type, total_precincts, sort_order)
  select id, 'State Senate District 18', 'State Legislature', 'republican', 20, 70 from may_election
  returning id
),
race_senate_26 as (
  insert into races (election_id, name, category, type, total_precincts, sort_order)
  select id, 'State Senate District 26', 'State Legislature', 'republican', 20, 80 from may_election
  returning id
),

-- candidates
c_boe7 as (
  insert into candidates (race_id, name, incumbent, image_url, sort_order)
  select id, v.name, v.incumbent, v.image_url, v.sort_order
  from race_boe7,
       (values
         ('Amy Hamrick Morton', false, 'candidates/boe-post7-morton.jpg', 10),
         ('Kerry Warren Hatcher', false, 'candidates/boe-post7-hatcher.jpg', 20)
       ) as v(name, incumbent, image_url, sort_order)
  returning id
),
c_boe8 as (
  insert into candidates (race_id, name, incumbent, image_url, sort_order)
  select id, v.name, v.incumbent, v.image_url, v.sort_order
  from race_boe8,
       (values
         ('Lisa Williams Garrett-Boyd', true,  'candidates/boe-post8-garrett-boyd.jpg', 10),
         ('Carlos Antonio McCloud',    false, 'candidates/boe-post8-mccloud.jpg',      20),
         ('Jonathan Paul Fisher',      false, 'candidates/boe-post8-fisher.jpg',       30),
         ('Nola McFadden',             false, 'candidates/boe-post8-mcfadden.jpg',     40)
       ) as v(name, incumbent, image_url, sort_order)
  returning id
),
c_water_atlarge as (
  insert into candidates (race_id, name, incumbent, image_url, sort_order)
  select id, v.name, v.incumbent, v.image_url, v.sort_order
  from race_water_atlarge,
       (values
         ('Gary Floyd Bechtel',   true,  'candidates/water-atlarge-bechtel.jpg', 10),
         ('Desmond Denois Brown', false, 'candidates/water-atlarge-brown.jpg',   20)
       ) as v(name, incumbent, image_url, sort_order)
  returning id
),
c_water_d2 as (
  insert into candidates (race_id, name, incumbent, image_url, sort_order)
  select id, v.name, v.incumbent, v.image_url, v.sort_order
  from race_water_d2,
       (values
         ('Marshall Talley',         false, 'candidates/water-d2-talley.jpg',          10),
         ('Renoalda Latis Scott',    false, 'candidates/water-d2-scott.jpg',           20),
         ('Ronald Edward Lemon',     false, 'candidates/water-d2-lemon.jpg',           30),
         ('Sharif Robbins-Brinson',  false, 'candidates/water-d2-robbins-brinson.jpg', 40)
       ) as v(name, incumbent, image_url, sort_order)
  returning id
),
c_water_d4 as (
  insert into candidates (race_id, name, incumbent, image_url, sort_order)
  select id, v.name, v.incumbent, v.image_url, v.sort_order
  from race_water_d4,
       (values
         ('Deron D. Rogers',         false, 'candidates/water-d4-rogers.jpg',    10),
         ('Frank K. Patterson Jr.',  false, 'candidates/water-d4-patterson.jpg', 20),
         ('Michael Arrish McKeever', false, 'candidates/water-d4-mckeever.jpg',  30)
       ) as v(name, incumbent, image_url, sort_order)
  returning id
),
c_house_142 as (
  insert into candidates (race_id, name, incumbent, party, image_url, sort_order)
  select id, v.name, v.incumbent, 'democratic', v.image_url, v.sort_order
  from race_house_142,
       (values
         ('Miriam Lucas Paris',      true,  'candidates/house-142-paris.jpg',  10),
         ('George Elton Thomas Jr.', false, 'candidates/house-142-thomas.jpg', 20)
       ) as v(name, incumbent, image_url, sort_order)
  returning id
),
c_senate_18 as (
  insert into candidates (race_id, name, incumbent, party, image_url, sort_order)
  select id, v.name, v.incumbent, 'republican', v.image_url, v.sort_order
  from race_senate_18,
       (values
         ('Steven Royce McNeel', true,  'candidates/senate-18-mcneel.jpg',   10),
         ('Eugene Allison',      false, 'candidates/senate-18-allison.jpg',  20)
       ) as v(name, incumbent, image_url, sort_order)
  returning id
),
c_senate_26 as (
  insert into candidates (race_id, name, incumbent, party, image_url, sort_order)
  select id, v.name, v.incumbent, 'republican', v.image_url, v.sort_order
  from race_senate_26,
       (values
         ('Nancy Hicks',          false, 'candidates/senate-26-hicks.jpg',   10),
         ('Tracy Conkle Wheeler', false, 'candidates/senate-26-wheeler.jpg', 20)
       ) as v(name, incumbent, image_url, sort_order)
  returning id
),

-- unopposed races (from index.html unopposedRaces array)
unop as (
  insert into unopposed_races (election_id, name, type, candidate_name, incumbent, sort_order)
  select id, v.name, v.type, v.candidate, v.incumbent, v.sort_order
  from may_election,
       (values
         ('Water Authority District 1', 'nonpartisan', 'Elaine H. Lucas',        true,  10),
         ('State Senate District 26',   'democratic',  'David Eugene Lucas',     true,  20),
         ('State House District 142',   'republican',  'Calvin Dennis Palmer',   false, 30),
         ('State House District 143',   'democratic',  'Anissa Monique Jones',   true,  40),
         ('State House District 144',   'republican',  'Roy Dale Washburn Jr.',  true,  50),
         ('State House District 145',   'democratic',  'Tangie Herring',         true,  60),
         ('State House District 145',   'republican',  'Eric Shannon Wilson',    false, 70),
         ('State House District 134',   'republican',  'Robert Dickey',          true,  80)
       ) as v(name, type, candidate, incumbent, sort_order)
  returning id
)

-- terminal select so the CTEs all execute
select 'May 19 election seeded' as status;

-- =============================================================================
-- 2. APRIL 14, 2026 DISTRICT 5 RUNOFF — certified, with timeline snapshots
-- =============================================================================

with d5_election as (
  insert into elections (name, election_date, location, status, total_precincts, last_updated)
  values ('District 5 Special Election Runoff', '2026-04-14', 'Macon-Bibb County', 'certified', 6, '8:50 PM — 6 of 6 precincts')
  returning id
),
d5_race as (
  insert into races (election_id, name, category, type, total_precincts, precincts_reporting, called, winner, sort_order)
  select id, 'Macon-Bibb Commission District 5', 'Commission', 'nonpartisan', 6, 6, true, 'Andrea Cooke', 10 from d5_election
  returning id
),
d5_cooke as (
  insert into candidates (race_id, name, incumbent, votes, image_url, sort_order)
  select id, 'Andrea Cooke', false, 746, 'andrea-cooke.jpg', 10 from d5_race
  returning id
),
d5_foster as (
  insert into candidates (race_id, name, incumbent, votes, image_url, sort_order)
  select id, 'Edward Foster', false, 313, 'edward-foster.jpg', 20 from d5_race
  returning id
),
-- timeline snapshots: vote totals at each update through election night
snap as (
  insert into result_snapshots (race_id, candidate_id, votes, precincts_reporting, note, recorded_at)
  -- 7:12 PM — Early vote
  select r.id, c.id, 203, 0, 'Early vote',
         '2026-04-14 19:12:00-04'::timestamptz
    from d5_race r, d5_cooke c
  union all
  select r.id, c.id, 97, 0, 'Early vote',
         '2026-04-14 19:12:00-04'::timestamptz
    from d5_race r, d5_foster c
  -- 7:24 PM — Early vote + absentee
  union all
  select r.id, c.id, 210, 0, 'Early vote + absentee',
         '2026-04-14 19:24:00-04'::timestamptz
    from d5_race r, d5_cooke c
  union all
  select r.id, c.id, 113, 0, 'Early vote + absentee',
         '2026-04-14 19:24:00-04'::timestamptz
    from d5_race r, d5_foster c
  -- 7:55 PM — 1 of 6 precincts
  union all
  select r.id, c.id, 339, 1, 'First precinct in',
         '2026-04-14 19:55:00-04'::timestamptz
    from d5_race r, d5_cooke c
  union all
  select r.id, c.id, 136, 1, 'First precinct in',
         '2026-04-14 19:55:00-04'::timestamptz
    from d5_race r, d5_foster c
  -- 8:29 PM — 4 of 6 precincts
  union all
  select r.id, c.id, 652, 4, null,
         '2026-04-14 20:29:00-04'::timestamptz
    from d5_race r, d5_cooke c
  union all
  select r.id, c.id, 243, 4, null,
         '2026-04-14 20:29:00-04'::timestamptz
    from d5_race r, d5_foster c
  -- 8:39 PM — 5 of 6 precincts
  union all
  select r.id, c.id, 714, 5, null,
         '2026-04-14 20:39:00-04'::timestamptz
    from d5_race r, d5_cooke c
  union all
  select r.id, c.id, 277, 5, null,
         '2026-04-14 20:39:00-04'::timestamptz
    from d5_race r, d5_foster c
  -- 8:50 PM — 6 of 6 FINAL
  union all
  select r.id, c.id, 746, 6, 'Final — race called for Cooke',
         '2026-04-14 20:50:00-04'::timestamptz
    from d5_race r, d5_cooke c
  union all
  select r.id, c.id, 313, 6, 'Final — race called for Cooke',
         '2026-04-14 20:50:00-04'::timestamptz
    from d5_race r, d5_foster c
  returning id
)
select 'District 5 runoff seeded' as status;
