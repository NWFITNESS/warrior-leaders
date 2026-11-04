-- Scheduled public reveal: a workout can be Ready for judges but hidden from athletes / the public until public_from.
alter table wl_workouts add column public_from timestamptz;

create or replace function wl_public_leaderboard()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'settings', (select json_build_object('name', name, 'event_date', event_date, 'venue', venue, 'points_method', points_method,
                                          'custom_points', custom_points, 'overall_tiebreak', overall_tiebreak)
                 from wl_competition_settings where id = 1),
    'divisions', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'sex', sex, 'level', level) order by sort_order) from wl_divisions), '[]'::json),
    'teams', coalesce((select json_agg(json_build_object(
                 'id', t.id, 'name', t.name, 'division_id', t.division_id,
                 'athletes', coalesce((select json_agg(json_build_object('first_name', a.first_name, 'last_name', a.last_name) order by a.position) from wl_athletes a where a.team_id = t.id), '[]'::json)
               ) order by t.name) from wl_teams t), '[]'::json),
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
               ) order by w.number) from wl_workouts w where w.status <> 'draft' and (w.public_from is null or w.public_from <= now())), '[]'::json),
    'releases', coalesce((select json_agg(json_build_object('part_id', r.part_id, 'division_id', r.division_id, 'released_at', r.released_at))
                 from wl_releases r), '[]'::json),
    'scores', coalesce((select json_agg(json_build_object('part_id', s.part_id, 'team_id', s.team_id, 'value', s.value,
                                                          'tiebreak_value', s.tiebreak_value, 'capped', s.capped, 'entries', s.entries))
                 from wl_scores s
                 join wl_teams t on t.id = s.team_id
                 join wl_releases r on r.part_id = s.part_id and r.division_id = t.division_id
                 where s.status = 'verified'), '[]'::json)
  )
$$;

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
  where w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now())
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

  select h.id into v_heat from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now()) where h.id = p_heat;
  if v_heat is null then
    select h.id into v_heat from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now()) where h.id = v_pinned;
  end if;
  if v_heat is null then
    select la.heat_id into v_heat
    from wl_scores s
    join wl_lane_assignments la on la.id = s.lane_assignment_id
    join wl_heats h on h.id = la.heat_id
    join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now())
    where s.updated_at > now() - interval '30 minutes'
    order by s.updated_at desc
    limit 1;
  end if;
  -- nobody scoring: the heat that's on now by the screen's clock (sent by the screen)
  if v_heat is null then
    select h.id into v_heat from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now()) where h.id = p_fallback;
  end if;
  if v_heat is null and v_today then
    select h.id into v_heat
    from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now())
    where h.start_time <= v_now
    order by h.start_time desc, w.number desc, h.number desc
    limit 1;
  end if;
  if v_heat is null then
    select h.id into v_heat
    from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now())
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
      from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' and not w.open_entry and (w.public_from is null or w.public_from <= now())
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
