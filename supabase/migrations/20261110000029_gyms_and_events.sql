-- Phase 1 of Gyms & Events (10 Nov 2026): see vault "Warrior Leaders - Gyms & Events Plan".
-- Adds gyms and events (competitions) and links the top-level tables to an event.
-- Northern Warrior is the first gym; Same-sex Pairs 2026 its first event. Every existing row is
-- backfilled to that event, and the new columns default to it, so the current app keeps working
-- unchanged until Phase 2 makes it event-aware (and removes the defaults).
-- Before running: a full copy of every wl_ table was made in schema wl_backup_20261110.

-- ── Gyms ──────────────────────────────────────────────────────────────────────
create table wl_gyms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_url   text,
  brand_colour text,
  created_at timestamptz not null default now()
);

-- Who can run a gym's events (used from Phase 5; NW staff use wl_is_staff() until then)
create table wl_gym_members (
  gym_id     uuid not null references wl_gyms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'admin' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  primary key (gym_id, user_id)
);

-- ── Events ────────────────────────────────────────────────────────────────────
-- Settings (points method, judge codes, live heat…) move in from wl_competition_settings in Phase 2.
create table wl_competitions (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references wl_gyms(id) on delete restrict,
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text not null,
  event_date date,
  status     text not null default 'draft' check (status in ('draft', 'live', 'finished', 'archived')),
  created_at timestamptz not null default now(),
  unique (gym_id, slug)
);
create index on wl_competitions (gym_id);

insert into wl_gyms (id, name, slug)
values ('6e0f2a5c-0000-4000-8000-000000000001', 'Northern Warrior', 'northern-warrior');

insert into wl_competitions (id, gym_id, slug, name, event_date, status)
select '6e0f2a5c-0000-4000-8000-000000000002', '6e0f2a5c-0000-4000-8000-000000000001', 'same-sex-pairs-2026',
       coalesce(nullif(s.competition_name, ''), 'Same-sex Pairs 2026'), coalesce(s.event_date, date '2026-11-07'), 'finished'
from wl_competition_settings s where s.id = 1;

-- ── Link the top-level tables to an event ─────────────────────────────────────
-- (athletes, heats, lanes, parts, movements, scores, score events, heat starts, releases and
--  appeals follow their parent, so they need no column)
do $$
declare t text;
begin
  foreach t in array array['wl_divisions', 'wl_teams', 'wl_workouts', 'wl_judges', 'wl_email_log', 'wl_audit_log'] loop
    execute format('alter table %I add column competition_id uuid references wl_competitions(id) on delete cascade', t);
    execute format('update %I set competition_id = %L', t, '6e0f2a5c-0000-4000-8000-000000000002');
    -- temporary default so today's app (not yet event-aware) still inserts into the right event
    execute format('alter table %I alter column competition_id set default %L', t, '6e0f2a5c-0000-4000-8000-000000000002');
    execute format('alter table %I alter column competition_id set not null', t);
    execute format('create index on %I (competition_id)', t);
  end loop;
end $$;

-- ── Unique rules are per event ────────────────────────────────────────────────
alter table wl_divisions drop constraint wl_divisions_name_key;
alter table wl_divisions add constraint wl_divisions_competition_name_key unique (competition_id, name);
alter table wl_workouts add constraint wl_workouts_competition_number_key unique (competition_id, number);

-- ── Access: staff manage everything (as for the other wl_ tables); the public reads via RPCs ──
alter table wl_gyms enable row level security;
alter table wl_gym_members enable row level security;
alter table wl_competitions enable row level security;
create policy "wl staff full access" on wl_gyms for all to authenticated using (wl_is_staff()) with check (wl_is_staff());
create policy "wl staff full access" on wl_gym_members for all to authenticated using (wl_is_staff()) with check (wl_is_staff());
create policy "wl staff full access" on wl_competitions for all to authenticated using (wl_is_staff()) with check (wl_is_staff());
