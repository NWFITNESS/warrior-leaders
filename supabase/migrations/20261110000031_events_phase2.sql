-- Gyms & Events phase 2 (10 Nov 2026)
-- * Competition settings move from the single wl_competition_settings row onto each event (wl_competitions).
-- * A gym has a "current event": what its public site and judge app show until phases 3–4 add the event
--   to every address. wl_current_competition() returns Northern Warrior's.
-- * Every public and judge function only sees one event (judges: their own event).
-- * The temporary defaults from phase 1 are removed: the admin now says which event each row belongs to.

-- ── Settings onto events ──────────────────────────────────────────────────────
alter table wl_competitions
  add column short_name       text not null default 'Warrior Leaders',
  add column venue            text not null default '',
  add column points_method    text not null default 'placing',
  add column custom_points    integer[] not null default '{}',
  add column lanes_per_heat   integer not null default 6,
  add column judge_code       text not null default lpad(floor(random() * 10000)::int::text, 4, '0'),
  add column head_judge_code  text not null default lpad(floor(random() * 10000)::int::text, 4, '0'),
  add column overall_tiebreak text not null default 'Best placing in the last released event',
  add column live_heat_id     uuid references wl_heats(id) on delete set null,
  add column live_promo       jsonb not null default '{}',
  add column scores_reset_at  timestamptz,
  add column score_resets     jsonb not null default '{}',
  add column updated_at       timestamptz not null default now();

update wl_competitions c set
  short_name = s.name, venue = s.venue, points_method = s.points_method, custom_points = s.custom_points,
  lanes_per_heat = s.lanes_per_heat, judge_code = s.judge_code, head_judge_code = s.head_judge_code,
  overall_tiebreak = s.overall_tiebreak, live_heat_id = s.live_heat_id, live_promo = s.live_promo,
  scores_reset_at = s.scores_reset_at, score_resets = s.score_resets, updated_at = s.updated_at
from wl_competition_settings s
where s.id = 1 and c.id = '6e0f2a5c-0000-4000-8000-000000000002';

-- ── The gym's current event ───────────────────────────────────────────────────
alter table wl_gyms add column current_competition_id uuid references wl_competitions(id) on delete set null;
update wl_gyms set current_competition_id = '6e0f2a5c-0000-4000-8000-000000000002' where slug = 'northern-warrior';

create or replace function public.wl_current_competition() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select current_competition_id from wl_gyms where slug = 'northern-warrior'
$$;

-- The old settings row is kept (renamed) for reference; a read-only view with the old shape stands in
-- for anything not yet moved over.
alter table wl_competition_settings rename to wl_competition_settings_old;
create view wl_competition_settings with (security_invoker = true) as
  select 1 as id, c.short_name as name, c.start_date as event_date, c.venue, c.points_method, c.custom_points,
         c.lanes_per_heat, c.judge_code, c.overall_tiebreak, c.updated_at, c.live_heat_id, c.head_judge_code,
         c.name as competition_name, c.live_promo, c.scores_reset_at, c.score_resets
  from wl_competitions c where c.id = wl_current_competition();

-- ── Phase 1 defaults off: rows must say which event they belong to ────────────
alter table wl_divisions alter column competition_id drop default;
alter table wl_teams     alter column competition_id drop default;
alter table wl_workouts  alter column competition_id drop default;
alter table wl_judges    alter column competition_id drop default;
-- logs written from inside functions fall back to the current event
alter table wl_audit_log alter column competition_id set default wl_current_competition();
alter table wl_email_log alter column competition_id set default wl_current_competition();

-- Teams must be in their division's event
create or replace function wl_teams_same_event() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from wl_divisions d where d.id = new.division_id and d.competition_id = new.competition_id) then
    raise exception 'team and division are in different events';
  end if;
  return new;
end $$;
create trigger wl_teams_same_event before insert or update of division_id, competition_id on wl_teams
  for each row execute function wl_teams_same_event();

-- ── Judges: sessions belong to the judge's own event ──────────────────────────
create or replace function public.wl_judge_from_token(p_token uuid)
returns wl_judges language sql stable security definer set search_path to 'public' as $function$
  select j.*
  from wl_judge_sessions s
  join wl_judges j on j.id = s.judge_id and j.active
  join wl_competitions c on c.id = j.competition_id
   and s.code = case when j.role = 'head' then c.head_judge_code else c.judge_code end
  where s.token = p_token
$function$;

create or replace function public.wl_judge_list()
returns json language sql stable security definer set search_path to 'public' as $function$
  select coalesce(json_agg(json_build_object('id', id, 'name', name, 'role', role) order by name), '[]'::json)
  from wl_judges where active and role = 'head' and competition_id = wl_current_competition()
$function$;

create or replace function public.wl_judge_login(p_judge uuid, p_code text)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role text;
  v_comp uuid;
  v_code text;
  v_fails int;
  v_token uuid;
begin
  select role, competition_id into v_role, v_comp from wl_judges where id = p_judge and active;
  if v_role is null then
    return json_build_object('error', 'unknown_judge');
  end if;
  select count(*) into v_fails from wl_judge_login_failures where judge_id = p_judge and at > now() - interval '15 minutes';
  if v_fails >= 8 then
    return json_build_object('error', 'locked');
  end if;
  select case when v_role = 'head' then head_judge_code else judge_code end into v_code from wl_competitions where id = v_comp;
  if p_code is distinct from v_code then
    insert into wl_judge_login_failures (judge_id) values (p_judge);
    return json_build_object('error', 'wrong_code');
  end if;
  insert into wl_judge_sessions (judge_id, code) values (p_judge, v_code) returning token into v_token;
  return json_build_object('token', v_token);
end
$function$;

create or replace function public.wl_judge_register(p_name text, p_code text)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_comp uuid := wl_current_competition();
  v_code text;
  v_judge wl_judges;
  v_token uuid;
begin
  if length(v_name) < 2 or length(v_name) > 40 then
    return json_build_object('error', 'bad_name');
  end if;
  if (select count(*) from wl_judge_login_failures where judge_id is null and at > now() - interval '15 minutes') >= 40 then
    return json_build_object('error', 'locked');
  end if;
  select judge_code into v_code from wl_competitions where id = v_comp;
  if v_code is null or p_code is distinct from v_code then
    insert into wl_judge_login_failures (judge_id) values (null);
    return json_build_object('error', 'wrong_code');
  end if;
  if exists (select 1 from wl_judges where competition_id = v_comp and role = 'head' and active and lower(name) = lower(v_name)) then
    return json_build_object('error', 'head_name');
  end if;
  select * into v_judge from wl_judges where competition_id = v_comp and role = 'lane' and lower(name) = lower(v_name) order by active desc, created_at limit 1;
  if v_judge.id is not null and not v_judge.active then
    return json_build_object('error', 'inactive');
  end if;
  if v_judge.id is null then
    insert into wl_judges (name, role, competition_id) values (v_name, 'lane', v_comp) returning * into v_judge;
  end if;
  insert into wl_judge_sessions (judge_id, code) values (v_judge.id, v_code) returning token into v_token;
  return json_build_object('token', v_token);
end
$function$;

create or replace function public.wl_judge_claim_lane(p_token uuid, p_lane uuid, p_force boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  j wl_judges;
  v_la wl_lane_assignments;
  v_workout uuid;
  v_other text;
begin
  j := wl_judge_from_token(p_token);
  if j.id is null then
    return json_build_object('error', 'signed_out');
  end if;
  select la.* into v_la from wl_lane_assignments la where la.id = p_lane;
  select w.id into v_workout from wl_heats h join wl_workouts w on w.id = h.workout_id
   where h.id = v_la.heat_id and w.status in ('ready', 'live') and w.competition_id = j.competition_id;
  if v_la.id is null or v_workout is null then
    return json_build_object('error', 'not_open');
  end if;
  if v_la.team_id is null then
    return json_build_object('error', 'empty_lane');
  end if;
  if j.role = 'head' or v_la.judge_id = j.id then
    return json_build_object('ok', true, 'lane_assignment_id', v_la.id);
  end if;
  if wl_lane_done(v_la.team_id, v_workout) then
    return json_build_object('error', 'finished');
  end if;
  if v_la.judge_id is not null and not coalesce(p_force, false) then
    select name into v_other from wl_judges where id = v_la.judge_id;
    return json_build_object('error', 'taken', 'judge_name', v_other);
  end if;
  update wl_lane_assignments set judge_id = j.id where id = v_la.id;
  return json_build_object('ok', true, 'lane_assignment_id', v_la.id);
end
$function$;

create or replace function public.wl_judge_open_lane(p_token uuid, p_workout uuid, p_team uuid)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  j wl_judges;
  v_heat uuid;
  v_lane wl_lane_assignments;
begin
  j := wl_judge_from_token(p_token);
  if j.id is null then
    return json_build_object('error', 'signed_out');
  end if;
  if not exists (select 1 from wl_workouts where id = p_workout and open_entry and status in ('ready', 'live') and competition_id = j.competition_id) then
    return json_build_object('error', 'not_open');
  end if;
  if not exists (select 1 from wl_teams where id = p_team and competition_id = j.competition_id) then
    return json_build_object('error', 'unknown_team');
  end if;

  select id into v_heat from wl_heats where workout_id = p_workout order by number limit 1;
  if v_heat is null then
    insert into wl_heats (workout_id, number) values (p_workout, 1) returning id into v_heat;
  end if;

  select * into v_lane from wl_lane_assignments where heat_id = v_heat and team_id = p_team;
  if v_lane.id is null then
    insert into wl_lane_assignments (heat_id, lane, team_id, judge_id)
    values (v_heat, coalesce((select max(lane) from wl_lane_assignments where heat_id = v_heat), 0) + 1, p_team, j.id)
    returning * into v_lane;
  elsif v_lane.judge_id is distinct from j.id
    and not exists (select 1 from wl_scores s where s.lane_assignment_id = v_lane.id and s.status in ('submitted', 'verified', 'appeal')) then
    update wl_lane_assignments set judge_id = j.id where id = v_lane.id;
  end if;
  return json_build_object('ok', true, 'lane_assignment_id', v_lane.id);
end
$function$;

create or replace function public.wl_judge_save_score(p_token uuid, p_lane_assignment uuid, p_part uuid, p_score json)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  j wl_judges;
  v_team uuid;
  v_ok boolean;
  v_existing wl_scores;
  v_status text := coalesce(p_score->>'status', 'draft');
  v_id uuid;
  e json;
begin
  j := wl_judge_from_token(p_token);
  if j.id is null then
    return json_build_object('error', 'signed_out');
  end if;
  if v_status not in ('draft', 'submitted') then
    return json_build_object('error', 'bad_status');
  end if;

  select la.team_id, exists (select 1 from wl_workout_parts p where p.id = p_part and p.workout_id = h.workout_id)
    into v_team, v_ok
  from wl_lane_assignments la join wl_heats h on h.id = la.heat_id join wl_workouts w on w.id = h.workout_id
  where la.id = p_lane_assignment and (la.judge_id = j.id or j.role = 'head') and w.competition_id = j.competition_id;
  if v_team is null or not v_ok then
    return json_build_object('error', 'not_your_lane');
  end if;

  select * into v_existing from wl_scores where part_id = p_part and team_id = v_team;
  if v_existing.status in ('verified', 'rejected') then
    return json_build_object('error', 'locked', 'status', v_existing.status);
  end if;
  if v_existing.status in ('submitted', 'appeal') and v_status = 'draft' then
    return json_build_object('ok', true, 'id', v_existing.id, 'status', v_existing.status, 'ignored', true);
  end if;

  insert into wl_scores as s (part_id, team_id, lane_assignment_id, judge_id, status, source, capped, value, reps, rounds,
                              tiebreak_value, entries, splits, signed_by, signature, submitted_at, updated_at)
  values (p_part, v_team, p_lane_assignment, j.id, v_status, 'judge',
          coalesce((p_score->>'capped')::boolean, false),
          nullif(p_score->>'value', '')::numeric,
          nullif(p_score->>'reps', '')::int,
          nullif(p_score->>'rounds', '')::int,
          nullif(p_score->>'tiebreak_value', '')::numeric,
          coalesce((p_score->'entries')::jsonb, '{}'::jsonb),
          coalesce((p_score->'splits')::jsonb, '[]'::jsonb),
          p_score->>'signed_by',
          nullif(left(p_score->>'signature', 20000), ''),
          case when v_status = 'submitted' then now() end,
          now())
  on conflict (part_id, team_id) do update set
    lane_assignment_id = excluded.lane_assignment_id,
    judge_id = excluded.judge_id,
    status = excluded.status,
    capped = excluded.capped,
    value = excluded.value,
    reps = excluded.reps,
    rounds = excluded.rounds,
    tiebreak_value = excluded.tiebreak_value,
    entries = excluded.entries,
    splits = excluded.splits,
    signed_by = excluded.signed_by,
    signature = excluded.signature,
    submitted_at = coalesce(excluded.submitted_at, s.submitted_at),
    updated_at = now()
  returning id into v_id;

  for e in select * from json_array_elements(coalesce(p_score->'events', '[]'::json)) loop
    insert into wl_score_events (score_id, judge_id, kind, payload, client_ts)
    values (v_id, j.id, coalesce(e->>'kind', 'event'), coalesce((e->'payload')::jsonb, '{}'::jsonb), nullif(e->>'at', '')::timestamptz);
  end loop;

  return json_build_object('ok', true, 'id', v_id, 'status', v_status);
end
$function$;

create or replace function public.wl_judge_assignments(p_token uuid)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  j wl_judges;
  v_head boolean;
begin
  j := wl_judge_from_token(p_token);
  if j.id is null then
    return json_build_object('error', 'signed_out');
  end if;
  v_head := j.role = 'head';
  update wl_judge_sessions set last_seen = now() where token = p_token;

  return json_build_object(
    'scores_reset_at', (select (extract(epoch from scores_reset_at) * 1000)::bigint from wl_competitions where id = j.competition_id),
    'score_resets', (select coalesce(json_object_agg(p.id, (extract(epoch from greatest(s.scores_reset_at, (s.score_resets ->> p.workout_id::text)::timestamptz)) * 1000)::bigint)
                              filter (where s.scores_reset_at is not null or s.score_resets ? p.workout_id::text), '{}'::json)
                          from wl_workout_parts p join wl_workouts pw on pw.id = p.workout_id and pw.competition_id = j.competition_id
                          cross join wl_competitions s where s.id = j.competition_id),
    'judge', json_build_object('id', j.id, 'name', j.name, 'role', j.role),
    'lanes', coalesce((
      select json_agg(json_build_object(
        'lane_assignment_id', la.id,
        'heat_id', h.id,
        'heat_number', h.number,
        'start_time', h.start_time,
        'lane', la.lane,
        'judge_name', jj.name,
        'workout', json_build_object('id', w.id, 'number', w.number, 'name', w.name, 'description', w.description, 'status', w.status, 'open_entry', w.open_entry),
        'team', json_build_object(
          'id', t.id, 'name', t.name, 'division', d.name, 'level', d.level, 'sex', d.sex,
          'athletes', coalesce((select json_agg(json_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name, 'is_captain', a.is_captain) order by a.position)
                                from wl_athletes a where a.team_id = t.id), '[]'::json)
        ),
        'parts', coalesce((
          select json_agg(json_build_object(
            'id', p.id, 'label', p.label, 'name', p.name, 'score_type', p.score_type, 'direction', p.direction,
            'time_cap_seconds', p.time_cap_seconds, 'rounds', p.rounds, 'capped_round_rule', p.capped_round_rule,
            'total_reps', p.total_reps, 'unit', p.unit, 'load_entry', p.load_entry, 'scored', p.scored,
            'tiebreak_note', p.tiebreak_note, 'notes', p.notes,
            'tiebreak_rule', p.tiebreak_rule, 'tiebreak_movement_id', p.tiebreak_movement_id,
            'part_movements', coalesce((select json_agg((to_jsonb(m) - 'part_id') order by m.sort_order)
              from wl_part_movements m where m.part_id = p.id), '[]'::json)
          ) order by p.sort_order)
          from wl_workout_parts p where p.workout_id = w.id
        ), '[]'::json),
        'scores', coalesce((
          select json_agg(json_build_object('part_id', s.part_id, 'status', s.status, 'value', s.value, 'capped', s.capped,
                                            'entries', s.entries, 'splits', s.splits, 'signed_by', s.signed_by, 'signature', s.signature, 'tiebreak_value', s.tiebreak_value, 'updated_at', s.updated_at))
          from wl_scores s where s.team_id = t.id and s.part_id in (select id from wl_workout_parts where workout_id = w.id)
        ), '[]'::json)
      ) order by w.number, h.number, la.lane)
      from wl_lane_assignments la
      join wl_heats h on h.id = la.heat_id
      join wl_workouts w on w.id = h.workout_id and w.status in ('ready', 'live') and w.competition_id = j.competition_id
      join wl_teams t on t.id = la.team_id
      join wl_divisions d on d.id = t.division_id
      left join wl_judges jj on jj.id = la.judge_id
      where (la.judge_id = j.id or v_head)
        and (v_head or w.public_from is null or w.public_from <= now())
    ), '[]'::json),
    'heats', coalesce((
      select json_agg(json_build_object(
        'id', h.id, 'workout_id', w.id, 'number', h.number, 'start_time', h.start_time,
        'lanes', coalesce((
          select json_agg(json_build_object(
            'lane_assignment_id', la.id, 'lane', la.lane, 'team_name', t.name, 'division', d.name,
            'judge_id', la.judge_id, 'judge_name', jj.name,
            'started', exists (select 1 from wl_scores s join wl_workout_parts p on p.id = s.part_id where p.workout_id = w.id and s.team_id = t.id),
            'done', wl_lane_done(t.id, w.id)
          ) order by la.lane)
          from wl_lane_assignments la
          join wl_teams t on t.id = la.team_id
          join wl_divisions d on d.id = t.division_id
          left join wl_judges jj on jj.id = la.judge_id
          where la.heat_id = h.id), '[]'::json)
      ) order by w.number, h.number)
      from wl_heats h join wl_workouts w on w.id = h.workout_id
      where w.competition_id = j.competition_id
        and not w.open_entry and (w.status in ('ready', 'live') or (v_head and w.status = 'draft'))
        and (v_head or w.public_from is null or w.public_from <= now())
    ), '[]'::json),
    'workouts', coalesce((
      select json_agg(json_build_object(
        'id', w.id, 'number', w.number, 'name', w.name, 'description', w.description, 'status', w.status, 'open_entry', w.open_entry,
        'parts', coalesce((
          select json_agg(json_build_object(
            'id', p.id, 'label', p.label, 'name', p.name, 'sort_order', p.sort_order, 'score_type', p.score_type, 'direction', p.direction,
            'time_cap_seconds', p.time_cap_seconds, 'rounds', p.rounds, 'capped_round_rule', p.capped_round_rule,
            'total_reps', p.total_reps, 'unit', p.unit, 'load_entry', p.load_entry, 'scored', p.scored,
            'tiebreak_note', p.tiebreak_note, 'notes', p.notes,
            'tiebreak_rule', p.tiebreak_rule, 'tiebreak_movement_id', p.tiebreak_movement_id,
            'part_movements', coalesce((select json_agg((to_jsonb(m) - 'part_id') order by m.sort_order)
              from wl_part_movements m where m.part_id = p.id), '[]'::json)
          ) order by p.sort_order)
          from wl_workout_parts p where p.workout_id = w.id), '[]'::json)
      ) order by w.number)
      from wl_workouts w
      where w.competition_id = j.competition_id
        and (w.status in ('ready', 'live') or (v_head and w.status = 'draft'))
        and (v_head or w.public_from is null or w.public_from <= now())
    ), '[]'::json),
    'open_events', coalesce((
      select json_agg(json_build_object(
        'workout', json_build_object('id', w.id, 'number', w.number, 'name', w.name),
        'teams', coalesce((
          select json_agg(json_build_object(
            'id', t.id, 'name', t.name, 'division', d.name, 'level', d.level,
            'status', (select s.status from wl_scores s join wl_workout_parts p on p.id = s.part_id
                       where p.workout_id = w.id and s.team_id = t.id order by s.updated_at desc limit 1)
          ) order by d.sort_order, t.name)
          from wl_teams t join wl_divisions d on d.id = t.division_id
          where t.competition_id = j.competition_id), '[]'::json)
      ) order by w.number)
      from wl_workouts w where w.competition_id = j.competition_id and w.open_entry and w.status in ('ready', 'live')
        and (v_head or w.public_from is null or w.public_from <= now())
    ), '[]'::json)
  );
end
$function$;

-- ── Public: only the gym's current event ──────────────────────────────────────
create or replace function public.wl_public_settings()
returns json language sql stable security definer set search_path to 'public' as $function$
  select json_build_object('name', short_name, 'event_date', start_date, 'end_date', end_date, 'venue', venue)
  from wl_competitions where id = wl_current_competition()
$function$;

create or replace function public.wl_public_promo()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select live_promo from wl_competitions where id = wl_current_competition()
$function$;

create or replace function public.wl_public_heat_starts()
returns json language sql stable security definer set search_path to 'public' as $function$
  select coalesce(json_object_agg(heat_id, ms), '{}'::json) from (
    select hs.heat_id, round(extract(epoch from min(hs.started_at)) * 1000)::bigint ms
    from wl_heat_starts hs join wl_heats h on h.id = hs.heat_id join wl_workouts w on w.id = h.workout_id
    where hs.round = 1 and w.competition_id = wl_current_competition()
    group by hs.heat_id
  ) x
$function$;

create or replace function public.wl_public_teams()
returns json language sql stable security definer set search_path to 'public' as $function$
  select json_build_object(
    'divisions', coalesce((
      select json_agg(json_build_object('id', d.id, 'name', d.name) order by d.sort_order)
      from wl_divisions d where d.competition_id = wl_current_competition()
    ), '[]'::json),
    'teams', coalesce((
      select json_agg(json_build_object(
        'id', t.id, 'name', t.name, 'bib', t.bib, 'division_id', t.division_id,
        'athletes', coalesce((
          select json_agg(json_build_object('first_name', a.first_name, 'last_name', a.last_name, 'position', a.position) order by a.position)
          from wl_athletes a where a.team_id = t.id
        ), '[]'::json)
      ) order by t.name)
      from wl_teams t where t.competition_id = wl_current_competition()
    ), '[]'::json)
  )
$function$;

create or replace function public.wl_public_schedule()
returns json language sql stable security definer set search_path to 'public' as $function$
  select coalesce(json_agg(json_build_object(
    'workout_id', w.id, 'workout_number', w.number, 'workout_name', w.name,
    'heat_id', h.id, 'heat_number', h.number, 'start_time', h.start_time,
    'lanes', coalesce((select json_agg(json_build_object('lane', la.lane, 'team_id', t.id, 'team_name', t.name, 'division', d.name) order by la.lane)
                       from wl_lane_assignments la join wl_teams t on t.id = la.team_id join wl_divisions d on d.id = t.division_id
                       where la.heat_id = h.id), '[]'::json)
  ) order by w.number, h.number), '[]'::json)
  from wl_heats h join wl_workouts w on w.id = h.workout_id
  where w.competition_id = wl_current_competition()
    and w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now())
$function$;

create or replace function public.wl_public_leaderboard()
returns json language sql stable security definer set search_path to 'public' as $function$
  with c as (select * from wl_competitions where id = wl_current_competition())
  select json_build_object(
    'settings', (select json_build_object('name', short_name, 'event_date', start_date, 'end_date', end_date, 'venue', venue, 'points_method', points_method,
                                          'custom_points', custom_points, 'overall_tiebreak', overall_tiebreak) from c),
    'divisions', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'sex', sex, 'level', level) order by sort_order)
                 from wl_divisions where competition_id = (select id from c)), '[]'::json),
    'teams', coalesce((select json_agg(json_build_object(
                 'id', t.id, 'name', t.name, 'division_id', t.division_id,
                 'athletes', coalesce((select json_agg(json_build_object('first_name', a.first_name, 'last_name', a.last_name) order by a.position) from wl_athletes a where a.team_id = t.id), '[]'::json)
               ) order by t.name) from wl_teams t where t.competition_id = (select id from c)), '[]'::json),
    'workouts', coalesce((select json_agg(json_build_object(
                 'id', w.id, 'number', w.number, 'name', w.name, 'combine_parts', w.combine_parts, 'status', w.status,
                 'description', w.description, 'open_entry', w.open_entry,
                 'parts', coalesce((select json_agg(json_build_object(
                     'id', p.id, 'label', p.label, 'name', p.name, 'sort_order', p.sort_order, 'score_type', p.score_type,
                     'direction', p.direction, 'time_cap_seconds', p.time_cap_seconds, 'rounds', p.rounds,
                     'capped_round_rule', p.capped_round_rule, 'total_reps', p.total_reps, 'unit', p.unit,
                     'load_entry', p.load_entry, 'scored', p.scored, 'tiebreak_note', p.tiebreak_note, 'notes', null,
                     'part_movements', coalesce((select json_agg((to_jsonb(m) - 'part_id') order by m.sort_order)
                       from wl_part_movements m where m.part_id = p.id), '[]'::json)
                   ) order by p.sort_order) from wl_workout_parts p where p.workout_id = w.id), '[]'::json)
               ) order by w.number) from wl_workouts w
               where w.competition_id = (select id from c) and w.status <> 'draft' and (w.public_from is null or w.public_from <= now())), '[]'::json),
    'upcoming', coalesce((select json_agg(json_build_object('number', w.number, 'public_from', w.public_from) order by w.number)
                 from wl_workouts w where w.competition_id = (select id from c) and w.public_from > now()), '[]'::json),
    'releases', coalesce((select json_agg(json_build_object('part_id', r.part_id, 'division_id', r.division_id, 'released_at', r.released_at))
                 from wl_releases r join wl_divisions d on d.id = r.division_id where d.competition_id = (select id from c)), '[]'::json),
    'scores', coalesce((select json_agg(json_build_object('part_id', s.part_id, 'team_id', s.team_id, 'value', s.value,
                                                          'tiebreak_value', s.tiebreak_value, 'capped', s.capped, 'entries', s.entries))
                 from wl_scores s
                 join wl_teams t on t.id = s.team_id and t.competition_id = (select id from c)
                 join wl_releases r on r.part_id = s.part_id and r.division_id = t.division_id
                 where s.status = 'verified'), '[]'::json)
  )
$function$;

-- Heats of an event's public (non-draft, revealed, heat-based) workouts
create or replace function public.wl_live_heats(p_comp uuid)
returns table (id uuid, workout_id uuid, number int, start_time time, wnumber int)
language sql stable security definer set search_path to 'public' as $function$
  select h.id, w.id, h.number, h.start_time, w.number from wl_heats h join wl_workouts w on w.id = h.workout_id
  where w.competition_id = p_comp and w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now())
$function$;
revoke all on function public.wl_live_heats(uuid) from public, anon, authenticated;

create or replace function public.wl_public_live(p_heat uuid default null, p_fallback uuid default null)
returns json language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_comp uuid := wl_current_competition();
  v_heat uuid;
  v_pinned uuid;
  v_now time := (now() at time zone 'Europe/London')::time;
  v_today boolean;
begin
  select live_heat_id, coalesce((now() at time zone 'Europe/London')::date between start_date and coalesce(end_date, start_date), false)
    into v_pinned, v_today
  from wl_competitions where id = v_comp;

  select id into v_heat from wl_live_heats(v_comp) where id = p_heat;
  if v_heat is null then
    select id into v_heat from wl_live_heats(v_comp) where id = v_pinned;
  end if;
  if v_heat is null then
    select la.heat_id into v_heat
    from wl_scores s
    join wl_lane_assignments la on la.id = s.lane_assignment_id
    join wl_live_heats(v_comp) lh on lh.id = la.heat_id
    where s.updated_at > now() - interval '30 minutes'
    order by s.updated_at desc
    limit 1;
  end if;
  if v_heat is null then
    select id into v_heat from wl_live_heats(v_comp) where id = p_fallback;
  end if;
  if v_heat is null and v_today then
    select id into v_heat from wl_live_heats(v_comp) where start_time <= v_now order by start_time desc, wnumber desc, number desc limit 1;
  end if;
  if v_heat is null then
    select id into v_heat from wl_live_heats(v_comp) order by start_time nulls last, wnumber, number limit 1;
  end if;

  return json_build_object(
    'name', (select short_name from wl_competitions where id = v_comp),
    'heat_id', v_heat,
    'pinned', v_pinned is not null and v_pinned = v_heat,
    'server_now', (extract(epoch from now()) * 1000)::bigint,
    'heats', coalesce((
      select json_agg(json_build_object(
        'id', h.id, 'number', h.number, 'start_time', h.start_time,
        'workout_id', w.id, 'workout_number', w.number, 'workout_name', w.name,
        'duration_seconds', coalesce(w.heat_minutes * 60, (select coalesce(sum(coalesce(p.time_cap_seconds, 0) * case when p.score_type = 'for_time' then greatest(1, p.rounds) else 1 end), 0)
                             from wl_workout_parts p where p.workout_id = w.id)),
        'lanes', coalesce((
          select json_agg(json_build_object('lane', la.lane, 'lane_assignment_id', la.id, 'team_id', t.id, 'team_name', t.name,
                                            'division', d.name, 'level', d.level, 'sex', d.sex) order by la.lane)
          from wl_lane_assignments la join wl_teams t on t.id = la.team_id join wl_divisions d on d.id = t.division_id
          where la.heat_id = h.id), '[]'::json)
      ) order by h.start_time nulls last, w.number, h.number)
      from wl_live_heats(v_comp) lh join wl_heats h on h.id = lh.id join wl_workouts w on w.id = h.workout_id
    ), '[]'::json),
    'parts', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'label', p.label, 'name', p.name, 'sort_order', p.sort_order, 'score_type', p.score_type,
        'direction', p.direction, 'time_cap_seconds', p.time_cap_seconds, 'rounds', p.rounds,
        'capped_round_rule', p.capped_round_rule, 'total_reps', p.total_reps, 'unit', p.unit,
        'load_entry', p.load_entry, 'scored', p.scored, 'tiebreak_note', null, 'notes', null,
        'part_movements', coalesce((select json_agg((to_jsonb(m) - 'part_id') order by m.sort_order)
                                    from wl_part_movements m where m.part_id = p.id), '[]'::json)
      ) order by p.sort_order)
      from wl_workout_parts p where p.workout_id = (select workout_id from wl_live_heats(v_comp) where id = v_heat)
    ), '[]'::json),
    'progress', coalesce((
      select json_agg(json_build_object('lane_assignment_id', s.lane_assignment_id, 'part_id', s.part_id, 'status', s.status,
                                        'value', s.value, 'capped', s.capped, 'entries', s.entries, 'updated_at', s.updated_at))
      from wl_scores s
      join wl_lane_assignments la on la.id = s.lane_assignment_id and la.heat_id = v_heat
      where s.status <> 'rejected'
    ), '[]'::json)
  );
end
$function$;

-- ── Admin: reset scores for one workout, or a whole event ─────────────────────
drop function if exists public.wl_admin_reset_scores(uuid, boolean);
create or replace function public.wl_admin_reset_scores(p_workout uuid default null, p_free_lanes boolean default false, p_competition uuid default null)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_comp uuid;
  v_parts uuid[];
  v_scores int; v_lanes int := 0;
begin
  if not wl_is_staff() then raise exception 'not allowed'; end if;
  v_comp := coalesce((select competition_id from wl_workouts where id = p_workout), p_competition);
  if v_comp is null then raise exception 'which event?'; end if;
  select coalesce(array_agg(p.id), '{}') into v_parts
  from wl_workout_parts p join wl_workouts w on w.id = p.workout_id
  where w.competition_id = v_comp and (p_workout is null or p.workout_id = p_workout);

  delete from wl_score_events where score_id in (select id from wl_scores where part_id = any(v_parts));
  delete from wl_appeals where score_id in (select id from wl_scores where part_id = any(v_parts));
  delete from wl_scores where part_id = any(v_parts);
  get diagnostics v_scores = row_count;
  delete from wl_heat_starts where part_id = any(v_parts);
  delete from wl_releases where part_id = any(v_parts);

  if p_free_lanes then
    update wl_lane_assignments la set judge_id = null
    from wl_heats h join wl_workouts w on w.id = h.workout_id
    where h.id = la.heat_id and w.competition_id = v_comp and la.judge_id is not null
      and (p_workout is null or w.id = p_workout);
    get diagnostics v_lanes = row_count;
  end if;

  if p_workout is null then
    update wl_competitions set scores_reset_at = now(), score_resets = '{}'::jsonb, live_heat_id = null where id = v_comp;
  else
    update wl_competitions set score_resets = score_resets || jsonb_build_object(p_workout::text, now()) where id = v_comp;
  end if;

  return json_build_object('scores', v_scores, 'lanes', v_lanes);
end $function$;
revoke all on function public.wl_admin_reset_scores(uuid, boolean, uuid) from public, anon;
grant execute on function public.wl_admin_reset_scores(uuid, boolean, uuid) to authenticated;

-- ── Admin: copy divisions and workouts from one event into another ───────────
create or replace function public.wl_admin_copy_event(p_from uuid, p_to uuid, p_divisions boolean default true, p_workouts boolean default true)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_div int := 0; v_wk int := 0;
  w record; p record; v_w uuid; v_p uuid;
begin
  if not wl_is_staff() then raise exception 'not allowed'; end if;
  if p_from = p_to then raise exception 'pick a different event to copy from'; end if;
  if p_divisions then
    insert into wl_divisions (name, level, sex, sort_order, competition_id)
    select name, level, sex, sort_order, p_to from wl_divisions where competition_id = p_from
    on conflict (competition_id, name) do nothing;
    get diagnostics v_div = row_count;
  end if;
  if p_workouts then
    for w in select * from wl_workouts where competition_id = p_from order by number loop
      continue when exists (select 1 from wl_workouts where competition_id = p_to and number = w.number);
      insert into wl_workouts (number, name, description, combine_parts, status, open_entry, public_from, heat_minutes, competition_id)
      values (w.number, w.name, w.description, w.combine_parts, 'draft', w.open_entry, null, w.heat_minutes, p_to)
      returning id into v_w;
      v_wk := v_wk + 1;
      for p in select * from wl_workout_parts where workout_id = w.id order by sort_order loop
        insert into wl_workout_parts (workout_id, label, name, sort_order, score_type, direction, time_cap_seconds, total_reps, unit,
                                      load_entry, scored, tiebreak_note, notes, rounds, capped_round_rule, tiebreak_rule, tiebreak_movement_id)
        values (v_w, p.label, p.name, p.sort_order, p.score_type, p.direction, p.time_cap_seconds, p.total_reps, p.unit,
                p.load_entry, p.scored, p.tiebreak_note, p.notes, p.rounds, p.capped_round_rule, p.tiebreak_rule, null)
        returning id into v_p;
        insert into wl_part_movements (part_id, sort_order, name, reps, rx_load, scaled_load, standards, reps_female,
                                       scaled_name, scaled_reps, scaled_reps_female, scaled_standards, tap_step)
        select v_p, sort_order, name, reps, rx_load, scaled_load, standards, reps_female,
               scaled_name, scaled_reps, scaled_reps_female, scaled_standards, tap_step
        from wl_part_movements where part_id = p.id;
        -- the tiebreak movement points at the copy of the same movement
        if p.tiebreak_movement_id is not null then
          update wl_workout_parts set tiebreak_movement_id = (
            select nm.id from wl_part_movements om join wl_part_movements nm on nm.part_id = v_p and nm.sort_order = om.sort_order
            where om.id = p.tiebreak_movement_id limit 1)
          where id = v_p;
        end if;
      end loop;
    end loop;
  end if;
  return json_build_object('divisions', v_div, 'workouts', v_wk);
end $function$;
revoke all on function public.wl_admin_copy_event(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.wl_admin_copy_event(uuid, uuid, boolean, boolean) to authenticated;
