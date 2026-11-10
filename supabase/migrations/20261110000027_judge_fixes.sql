-- After-comp judge fixes (10 Nov 2026)
-- 1. wl_judge_heat_start: a judge who presses start late no longer moves the whole heat's official start.
--    The start is replaced only when no other lane in the heat is still running on it (a real heat re-run).
-- 2. wl_judge_assignments: lane judges don't see a workout (sheet, lanes or heats) before its public_from
--    reveal time. Head judges still see everything.

create or replace function public.wl_judge_heat_start(p_token uuid, p_lane uuid, p_part uuid, p_round integer, p_started_ms bigint)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  j wl_judges;
  v_heat uuid;
  v_open boolean;
  v_start timestamptz;
  v_mine timestamptz;
  v_round int := coalesce(p_round, 1);
  v_others boolean;
begin
  j := wl_judge_from_token(p_token);
  if j.id is null then
    return json_build_object('error', 'signed_out');
  end if;
  select h.id, w.open_entry into v_heat, v_open
  from wl_lane_assignments la join wl_heats h on h.id = la.heat_id join wl_workouts w on w.id = h.workout_id
  where la.id = p_lane and exists (select 1 from wl_workout_parts p where p.id = p_part and p.workout_id = w.id);
  if v_heat is null or v_open then
    return json_build_object('synced', false);
  end if;
  -- a phone clock that's way out is ignored in favour of the server's
  v_mine := to_timestamp(p_started_ms / 1000.0);
  if abs(extract(epoch from (v_mine - now()))) > 120 then v_mine := now(); end if;

  insert into wl_heat_starts (heat_id, part_id, round, started_at) values (v_heat, p_part, v_round, v_mine)
  on conflict (heat_id, part_id, round) do nothing;
  select started_at into v_start from wl_heat_starts where heat_id = v_heat and part_id = p_part and round = v_round;

  if v_mine > v_start + interval '30 seconds' then
    -- Is another lane in this heat still running on the official start (within 5 s of it)?
    -- If so, this judge is just late: keep the heat's start. If not, the heat was re-run: move it.
    select exists (
      select 1
      from wl_lane_assignments la
      join wl_scores s on s.lane_assignment_id = la.id and s.part_id = p_part
      where la.heat_id = v_heat and la.id <> p_lane
        and abs(coalesce(
              (s.entries -> 'rounds' -> (v_round - 1) ->> 'started_at')::numeric,
              case when v_round = 1 then (s.entries ->> 'started_at')::numeric end
            ) - extract(epoch from v_start) * 1000) <= 5000
    ) into v_others;
    if not coalesce(v_others, false) then
      update wl_heat_starts set started_at = v_mine where heat_id = v_heat and part_id = p_part and round = v_round;
      v_start := v_mine;
    end if;
  end if;
  return json_build_object('synced', true, 'heat_started_ms', round(extract(epoch from v_start) * 1000));
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
    'scores_reset_at', (select (extract(epoch from scores_reset_at) * 1000)::bigint from wl_competition_settings where id = 1),
    'score_resets', (select coalesce(json_object_agg(p.id, (extract(epoch from greatest(s.scores_reset_at, (s.score_resets ->> p.workout_id::text)::timestamptz)) * 1000)::bigint)
                              filter (where s.scores_reset_at is not null or s.score_resets ? p.workout_id::text), '{}'::json)
                          from wl_workout_parts p cross join wl_competition_settings s where s.id = 1),
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
      where not w.open_entry and (w.status in ('ready', 'live') or (v_head and w.status = 'draft'))
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
      where (w.status in ('ready', 'live') or (v_head and w.status = 'draft'))
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
          from wl_teams t join wl_divisions d on d.id = t.division_id), '[]'::json)
      ) order by w.number)
      from wl_workouts w where w.open_entry and w.status in ('ready', 'live')
        and (v_head or w.public_from is null or w.public_from <= now())
    ), '[]'::json)
  );
end
$function$;
