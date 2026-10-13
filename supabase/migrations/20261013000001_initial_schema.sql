-- The Warrior Leaders — initial schema
-- Admin (authenticated staff) has full access through RLS.
-- Public pages and the judge app read/write through server routes using the service role,
-- so anon has no direct table access.

create extension if not exists pgcrypto;

-- ── Competition settings (single row) ────────────────────────────────────────
create table competition_settings (
  id              int primary key default 1 check (id = 1),
  name            text not null default 'The Warrior Leaders',
  event_date      date not null default '2026-11-07',
  venue           text not null default 'Northern Warrior',
  points_method   text not null default 'placing' check (points_method in ('placing', 'reverse', 'custom')),
  custom_points   int[] not null default '{}',
  lanes_per_heat  int not null default 6 check (lanes_per_heat between 1 and 30),
  judge_code      text not null default lpad((floor(random() * 10000))::int::text, 4, '0'),
  overall_tiebreak text not null default 'Best placing in the last released event',
  updated_at      timestamptz not null default now()
);
insert into competition_settings (id) values (1);

-- ── Divisions ────────────────────────────────────────────────────────────────
create table divisions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  level       text not null check (level in ('rx', 'scaled')),
  sex         text not null check (sex in ('male', 'female', 'mixed')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
insert into divisions (name, level, sex, sort_order) values
  ('RX Male', 'rx', 'male', 1),
  ('RX Female', 'rx', 'female', 2),
  ('Scaled Male', 'scaled', 'male', 3),
  ('Scaled Female', 'scaled', 'female', 4);

-- ── Teams + athletes ─────────────────────────────────────────────────────────
create table teams (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references divisions(id) on delete restrict,
  name         text not null,
  bib          int,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (division_id, name)
);
create index teams_division_idx on teams(division_id);

create table athletes (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  position    int not null default 1,
  first_name  text not null,
  last_name   text not null default '',
  email       text,
  phone       text,
  is_captain  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index athletes_team_idx on athletes(team_id);

-- ── Workouts → parts → movements ─────────────────────────────────────────────
create table workouts (
  id             uuid primary key default gen_random_uuid(),
  number         int not null,
  name           text not null,
  description    text,
  combine_parts  boolean not null default false, -- true: scored parts are summed into one placing
  status         text not null default 'draft' check (status in ('draft', 'ready', 'live', 'complete')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table workout_parts (
  id                  uuid primary key default gen_random_uuid(),
  workout_id          uuid not null references workouts(id) on delete cascade,
  label               text not null default 'A',
  name                text not null default '',
  sort_order          int not null default 0,
  score_type          text not null default 'for_time'
                        check (score_type in ('for_time', 'amrap', 'max_reps', 'max_load', 'other')),
  direction           text not null default 'asc' check (direction in ('asc', 'desc')), -- asc = lowest wins
  time_cap_seconds    int,
  total_reps          int,          -- for_time: reps in the full workout (for capped scoring)
  unit                text,         -- 'other' type: m, cal, etc.
  load_entry          text not null default 'per_athlete' check (load_entry in ('per_athlete', 'per_team')),
  scored              boolean not null default true, -- false = buy-in, no placing
  tiebreak_note       text,
  notes               text
);
create index workout_parts_workout_idx on workout_parts(workout_id);

create table part_movements (
  id           uuid primary key default gen_random_uuid(),
  part_id      uuid not null references workout_parts(id) on delete cascade,
  sort_order   int not null default 0,
  name         text not null,
  reps         int,
  rx_load      text,
  scaled_load  text,
  standards    text
);
create index part_movements_part_idx on part_movements(part_id);

-- ── Judges ───────────────────────────────────────────────────────────────────
create table judges (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role        text not null default 'lane' check (role in ('head', 'lane')),
  phone       text,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Heats + lanes (week 2) ───────────────────────────────────────────────────
create table heats (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references workouts(id) on delete cascade,
  number       int not null,
  start_time   time,
  created_at   timestamptz not null default now(),
  unique (workout_id, number)
);

create table lane_assignments (
  id        uuid primary key default gen_random_uuid(),
  heat_id   uuid not null references heats(id) on delete cascade,
  lane      int not null,
  team_id   uuid references teams(id) on delete set null,
  judge_id  uuid references judges(id) on delete set null,
  unique (heat_id, lane)
);

-- ── Scores (weeks 2–3) ───────────────────────────────────────────────────────
create table scores (
  id                  uuid primary key default gen_random_uuid(),
  part_id             uuid not null references workout_parts(id) on delete cascade,
  team_id             uuid not null references teams(id) on delete cascade,
  lane_assignment_id  uuid references lane_assignments(id) on delete set null,
  judge_id            uuid references judges(id) on delete set null,
  status              text not null default 'draft'
                        check (status in ('draft', 'submitted', 'verified', 'appeal', 'rejected')),
  source              text not null default 'judge' check (source in ('judge', 'paper', 'admin')),
  capped              boolean not null default false,
  value               numeric,      -- seconds for for_time, kg for load, reps for reps/amrap
  reps                int,          -- reps completed when capped / amrap extra reps
  rounds              int,          -- amrap rounds
  tiebreak_value      numeric,
  entries             jsonb not null default '{}', -- raw inputs (per-athlete lifts, etc.)
  splits              jsonb not null default '[]', -- movement ticks [{movement_id, at_seconds}]
  signed_by           text,
  submitted_at        timestamptz,
  verified_at         timestamptz,
  verified_by         text,
  updated_at          timestamptz not null default now(),
  unique (part_id, team_id)
);
create index scores_part_idx on scores(part_id);

create table score_events (
  id          bigint generated always as identity primary key,
  score_id    uuid not null references scores(id) on delete cascade,
  judge_id    uuid references judges(id) on delete set null,
  kind        text not null,       -- start, tick, untick, cap, input, submit
  payload     jsonb not null default '{}',
  client_ts   timestamptz,
  server_ts   timestamptz not null default now()
);
create index score_events_score_idx on score_events(score_id);

create table appeals (
  id           uuid primary key default gen_random_uuid(),
  score_id     uuid not null references scores(id) on delete cascade,
  description  text not null,
  status       text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
  resolution   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create table releases (
  part_id      uuid not null references workout_parts(id) on delete cascade,
  division_id  uuid not null references divisions(id) on delete cascade,
  released_at  timestamptz not null default now(),
  released_by  text,
  primary key (part_id, division_id)
);

create table audit_log (
  id          bigint generated always as identity primary key,
  actor       text not null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on audit_log(created_at desc);

-- ── RLS: authenticated staff get full access; anon gets nothing ──────────────
do $$
declare t text;
begin
  foreach t in array array[
    'competition_settings','divisions','teams','athletes','workouts','workout_parts',
    'part_movements','judges','heats','lane_assignments','scores','score_events',
    'appeals','releases','audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "staff full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
