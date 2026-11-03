-- Side events (open entry): no heats. Any judge picks any team and scores them whenever;
-- the scores land in Admin → Scores for checking at the end of the day.
-- Behind the scenes each scored team gets a lane in one hidden heat of that workout, so the normal
-- judge save / verify / release flow is reused unchanged.

alter table wl_workouts add column open_entry boolean not null default false;
update wl_workouts set open_entry = true where number = 4;

-- A judge starts scoring a team in a side event: returns that team's lane (created if needed).
create or replace function wl_judge_open_lane(p_token uuid, p_workout uuid, p_team uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  j wl_judges;
  v_heat uuid;
  v_lane wl_lane_assignments;
begin
  j := wl_judge_from_token(p_token);
  if j.id is null then
    return json_build_object('error', 'signed_out');
  end if;
  if not exists (select 1 from wl_workouts where id = p_workout and open_entry and status in ('ready', 'live')) then
    return json_build_object('error', 'not_open');
  end if;
  if not exists (select 1 from wl_teams where id = p_team) then
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
    -- not finished yet: the judge now scoring them takes it over
    update wl_lane_assignments set judge_id = j.id where id = v_lane.id;
  end if;
  return json_build_object('ok', true, 'lane_assignment_id', v_lane.id);
end
$$;
revoke all on function wl_judge_open_lane(uuid, uuid, uuid) from public;
grant execute on function wl_judge_open_lane(uuid, uuid, uuid) to anon, authenticated;

create or replace function wl_judge_assignments(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  j wl_judges;
begin
  j := wl_judge_from_token(p_token);
  if j.id is null then
    return json_build_object('error', 'signed_out');
  end if;
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
      where la.judge_id = j.id or j.role = 'head'
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

-- side events have no heat times: keep them off the public schedule and the live screen
create or replace function wl_public_schedule()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
    'workout_id', w.id, 'workout_number', w.number, 'workout_name', w.name,
    'heat_id', h.id, 'heat_number', h.number, 'start_time', h.start_time,
    'lanes', coalesce((select json_agg(json_build_object('lane', la.lane, 'team_id', t.id, 'team_name', t.name, 'division', d.name) order by la.lane)
                       from wl_lane_assignments la join wl_teams t on t.id = la.team_id join wl_divisions d on d.id = t.division_id
                       where la.heat_id = h.id), '[]'::json)
  ) order by w.number, h.number), '[]'::json)
  from wl_heats h join wl_workouts w on w.id = h.workout_id
  where w.status <> 'draft' and not w.open_entry
$$;

create or replace function wl_public_live(p_heat uuid default null, p_fallback uuid default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_heat uuid;
  v_pinned uuid;
  v_now time := (now() at time zone 'Europe/London')::time;
  v_today boolean;
begin
  select live_heat_id, coalesce(event_date = (now() at time zone 'Europe/London')::date, false)
    into v_pinned, v_today
  from wl_competition_settings where id = 1;

  select h.id into v_heat from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry where h.id = p_heat;
  if v_heat is null then
    select h.id into v_heat from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry where h.id = v_pinned;
  end if;
  if v_heat is null then
    select la.heat_id into v_heat
    from wl_scores s
    join wl_lane_assignments la on la.id = s.lane_assignment_id
    join wl_heats h on h.id = la.heat_id
    join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry
    where s.updated_at > now() - interval '30 minutes'
    order by s.updated_at desc
    limit 1;
  end if;
  -- nobody scoring: the heat that's on now by the screen's clock (sent by the screen)
  if v_heat is null then
    select h.id into v_heat from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry where h.id = p_fallback;
  end if;
  if v_heat is null and v_today then
    select h.id into v_heat
    from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry
    where h.start_time <= v_now
    order by h.start_time desc, w.number desc, h.number desc
    limit 1;
  end if;
  if v_heat is null then
    select h.id into v_heat
    from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry
    order by h.start_time nulls last, w.number, h.number
    limit 1;
  end if;

  return json_build_object(
    'name', (select name from wl_competition_settings where id = 1),
    'heat_id', v_heat,
    'pinned', v_pinned is not null and v_pinned = v_heat,
    -- the screen corrects its own clock against this (TV clocks drift)
    'server_now', (extract(epoch from now()) * 1000)::bigint,
    'heats', coalesce((
      select json_agg(json_build_object(
        'id', h.id, 'number', h.number, 'start_time', h.start_time,
        'workout_id', w.id, 'workout_number', w.number, 'workout_name', w.name,
        -- how long the heat is on the floor: sum of caps (timed rounds × window)
        'duration_seconds', (select coalesce(sum(coalesce(p.time_cap_seconds, 0) * case when p.score_type = 'for_time' then greatest(1, p.rounds) else 1 end), 0)
                             from wl_workout_parts p where p.workout_id = w.id),
        'lanes', coalesce((
          select json_agg(json_build_object('lane', la.lane, 'lane_assignment_id', la.id, 'team_id', t.id, 'team_name', t.name,
                                            'division', d.name, 'level', d.level, 'sex', d.sex) order by la.lane)
          from wl_lane_assignments la join wl_teams t on t.id = la.team_id join wl_divisions d on d.id = t.division_id
          where la.heat_id = h.id), '[]'::json)
      ) order by h.start_time nulls last, w.number, h.number)
      from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry
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
      from wl_workout_parts p where p.workout_id = (select workout_id from wl_heats where id = v_heat)
    ), '[]'::json),
    -- the judges' working copy for each lane of the shown heat (unverified, live)
    'progress', coalesce((
      select json_agg(json_build_object('lane_assignment_id', s.lane_assignment_id, 'part_id', s.part_id, 'status', s.status,
                                        'value', s.value, 'capped', s.capped, 'entries', s.entries, 'updated_at', s.updated_at))
      from wl_scores s
      join wl_lane_assignments la on la.id = s.lane_assignment_id and la.heat_id = v_heat
      where s.status <> 'rejected'
    ), '[]'::json)
  );
end
$$;
