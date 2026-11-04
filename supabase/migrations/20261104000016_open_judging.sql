-- Open judging: anyone with the link (or QR) types their name + the judge code and becomes a lane judge.
-- They then pick any event → heat → lane and take it (no admin assignment needed).
-- Head judges are still set up in admin and sign in with their own, separate head judge code.

alter table wl_competition_settings
  add column head_judge_code text not null default lpad((floor(random() * 10000))::int::text, 4, '0');
update wl_competition_settings set head_judge_code = lpad((floor(random() * 10000))::int::text, 4, '0') where head_judge_code = judge_code;
alter table wl_competition_settings add constraint wl_head_code_differs check (head_judge_code <> judge_code);

-- the placeholder judges from testing: free up the Event 1 lanes they were holding
delete from wl_judges where name like 'Demo Judge %' and role = 'lane'
  and not exists (select 1 from wl_scores s where s.judge_id = wl_judges.id);

-- A session is valid while its code still matches: lane judges the judge code, head judges the head code.
create or replace function wl_judge_from_token(p_token uuid)
returns wl_judges
language sql
stable
security definer
set search_path = public
as $$
  select j.*
  from wl_judge_sessions s
  join wl_judges j on j.id = s.judge_id and j.active
  join wl_competition_settings c on c.id = 1
   and s.code = case when j.role = 'head' then c.head_judge_code else c.judge_code end
  where s.token = p_token
$$;
revoke all on function wl_judge_from_token(uuid) from public, anon, authenticated;

-- Only head judges are picked from a list now.
create or replace function wl_judge_list()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object('id', id, 'name', name, 'role', role) order by name), '[]'::json)
  from wl_judges where active and role = 'head'
$$;

-- Head judge sign-in (picked from the list) with the head judge code.
create or replace function wl_judge_login(p_judge uuid, p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_code text;
  v_fails int;
  v_token uuid;
begin
  select role into v_role from wl_judges where id = p_judge and active;
  if v_role is null then
    return json_build_object('error', 'unknown_judge');
  end if;
  select count(*) into v_fails from wl_judge_login_failures where judge_id = p_judge and at > now() - interval '15 minutes';
  if v_fails >= 8 then
    return json_build_object('error', 'locked');
  end if;
  select case when v_role = 'head' then head_judge_code else judge_code end into v_code from wl_competition_settings where id = 1;
  if p_code is distinct from v_code then
    insert into wl_judge_login_failures (judge_id) values (p_judge);
    return json_build_object('error', 'wrong_code');
  end if;
  insert into wl_judge_sessions (judge_id, code) values (p_judge, v_code) returning token into v_token;
  return json_build_object('token', v_token);
end
$$;

-- Lane judge sign-up: name + judge code. Same name again = the same judge (so a new phone picks up their lanes).
create or replace function wl_judge_register(p_name text, p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_code text;
  v_judge wl_judges;
  v_token uuid;
begin
  if length(v_name) < 2 or length(v_name) > 40 then
    return json_build_object('error', 'bad_name');
  end if;
  -- shared limit for name sign-ups (no judge yet to pin failures to)
  if (select count(*) from wl_judge_login_failures where judge_id is null and at > now() - interval '15 minutes') >= 40 then
    return json_build_object('error', 'locked');
  end if;
  select judge_code into v_code from wl_competition_settings where id = 1;
  if p_code is distinct from v_code then
    insert into wl_judge_login_failures (judge_id) values (null);
    return json_build_object('error', 'wrong_code');
  end if;
  if exists (select 1 from wl_judges where role = 'head' and active and lower(name) = lower(v_name)) then
    return json_build_object('error', 'head_name');
  end if;

  select * into v_judge from wl_judges where role = 'lane' and lower(name) = lower(v_name) order by active desc, created_at limit 1;
  if v_judge.id is not null and not v_judge.active then
    return json_build_object('error', 'inactive');
  end if;
  if v_judge.id is null then
    insert into wl_judges (name, role) values (v_name, 'lane') returning * into v_judge;
  end if;
  insert into wl_judge_sessions (judge_id, code) values (v_judge.id, v_code) returning token into v_token;
  return json_build_object('token', v_token);
end
$$;
revoke all on function wl_judge_register(text, text) from public;
grant execute on function wl_judge_register(text, text) to anon, authenticated;

-- Has this team got a submitted (or verified) score for every scored part of the workout?
create or replace function wl_lane_done(p_team uuid, p_workout uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from wl_workout_parts p
    where p.workout_id = p_workout
      and (p.scored or (select count(*) from wl_workout_parts x where x.workout_id = p_workout) = 1)
      and not exists (select 1 from wl_scores s where s.part_id = p.id and s.team_id = p_team and s.status in ('submitted', 'verified', 'appeal'))
  )
$$;
revoke all on function wl_lane_done(uuid, uuid) from public, anon, authenticated;

-- A judge takes a lane. If another judge has it, they get told who (and can take it over with p_force).
create or replace function wl_judge_claim_lane(p_token uuid, p_lane uuid, p_force boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
   where h.id = v_la.heat_id and w.status in ('ready', 'live');
  if v_la.id is null or v_workout is null then
    return json_build_object('error', 'not_open');
  end if;
  if v_la.team_id is null then
    return json_build_object('error', 'empty_lane');
  end if;
  -- head judges can score any lane without taking it
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
$$;
revoke all on function wl_judge_claim_lane(uuid, uuid, boolean) from public;
grant execute on function wl_judge_claim_lane(uuid, uuid, boolean) to anon, authenticated;

-- Everything the judge app needs:
--   lanes     the judge's own lanes in full (head judges: every lane)
--   heats     every heat with times and who's on each lane (to pick a lane / the head judge's heat sheet)
--   workouts  every workout with movements + standards (head judges also see drafts)
create or replace function wl_judge_assignments(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
      join wl_workouts w on w.id = h.workout_id and w.status in ('ready', 'live')
      join wl_teams t on t.id = la.team_id
      join wl_divisions d on d.id = t.division_id
      left join wl_judges jj on jj.id = la.judge_id
      where la.judge_id = j.id or v_head
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
      where not w.open_entry and (w.status in ('ready', 'live') or (v_head and w.status = 'draft'))
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
      where w.status in ('ready', 'live') or (v_head and w.status = 'draft')
    ), '[]'::json),
    -- side events: any judge can score any team, whenever it suits
    'open_events', coalesce((
      select json_agg(json_build_object(
        'workout', json_build_object('id', w.id, 'number', w.number, 'name', w.name),
        'teams', coalesce((
          select json_agg(json_build_object(
            'id', t.id, 'name', t.name, 'division', d.name, 'level', d.level,
            'status', (select s.status from wl_scores s join wl_workout_parts p on p.id = s.part_id
                       where p.workout_id = w.id and s.team_id = t.id order by s.updated_at desc limit 1)
          ) order by d.sort_order, t.name)
          from wl_teams t join wl_divisions d on d.id = t.division_id), '[]'::json)
      ) order by w.number)
      from wl_workouts w where w.open_entry and w.status in ('ready', 'live')
    ), '[]'::json)
  );
end
$$;
