-- The screen sends the heat that's on by its clock as a fallback (used only when nobody is scoring
-- and nothing is pinned), so the race follows the timetable but still follows the judges when running late.

drop function if exists wl_public_live(uuid);

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

  select h.id into v_heat from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' where h.id = p_heat;
  if v_heat is null then
    select h.id into v_heat from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' where h.id = v_pinned;
  end if;
  if v_heat is null then
    select la.heat_id into v_heat
    from wl_scores s
    join wl_lane_assignments la on la.id = s.lane_assignment_id
    join wl_heats h on h.id = la.heat_id
    join wl_workouts w on w.id = h.workout_id and w.status <> 'draft'
    where s.updated_at > now() - interval '30 minutes'
    order by s.updated_at desc
    limit 1;
  end if;
  -- nobody scoring: the heat that's on now by the screen's clock (sent by the screen)
  if v_heat is null then
    select h.id into v_heat from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft' where h.id = p_fallback;
  end if;
  if v_heat is null and v_today then
    select h.id into v_heat
    from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft'
    where h.start_time <= v_now
    order by h.start_time desc, w.number desc, h.number desc
    limit 1;
  end if;
  if v_heat is null then
    select h.id into v_heat
    from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft'
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
      from wl_heats h join wl_workouts w on w.id = h.workout_id and w.status <> 'draft'
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

revoke all on function wl_public_live(uuid, uuid) from public;
grant execute on function wl_public_live(uuid, uuid) to anon, authenticated;
