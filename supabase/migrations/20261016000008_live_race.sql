-- Live race screen + judge rep tapping.
--   * tap_step: how many reps one tap on the judge's "+" button counts (e.g. 3 for a 21-cal row)
--   * live_heat_id: the heat pinned to the big screen (null = follow the judges automatically)
--   * wl_public_live(): heat schedule + live progress of one heat, for /live

alter table wl_part_movements
  add column tap_step int not null default 1 check (tap_step between 1 and 50);

alter table wl_competition_settings
  add column live_heat_id uuid references wl_heats(id) on delete set null;

-- Which heat the screen shows: asked-for heat → pinned heat → heat judges touched in the last
-- 30 minutes → latest heat that has started by the clock (on the event day) → first heat.
create or replace function wl_public_live(p_heat uuid default null)
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
    'heats', coalesce((
      select json_agg(json_build_object(
        'id', h.id, 'number', h.number, 'start_time', h.start_time,
        'workout_id', w.id, 'workout_number', w.number, 'workout_name', w.name,
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

revoke all on function wl_public_live(uuid) from public;
grant execute on function wl_public_live(uuid) to anon, authenticated;
