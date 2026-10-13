-- Public read functions for week 3. They only ever expose:
--   * verified scores for parts that have been RELEASED for that division
--   * the heat schedule and workout details for workouts that are not drafts
-- No emails or phone numbers.

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
                 'parts', coalesce((select json_agg(json_build_object(
                     'id', p.id, 'label', p.label, 'name', p.name, 'sort_order', p.sort_order, 'score_type', p.score_type,
                     'direction', p.direction, 'time_cap_seconds', p.time_cap_seconds, 'rounds', p.rounds,
                     'capped_round_rule', p.capped_round_rule, 'total_reps', p.total_reps, 'unit', p.unit,
                     'load_entry', p.load_entry, 'scored', p.scored, 'tiebreak_note', p.tiebreak_note, 'notes', null,
                     'part_movements', coalesce((select json_agg(json_build_object('id', m.id, 'sort_order', m.sort_order, 'name', m.name,
                         'reps', m.reps, 'reps_female', m.reps_female, 'rx_load', m.rx_load, 'scaled_load', m.scaled_load, 'standards', m.standards) order by m.sort_order)
                       from wl_part_movements m where m.part_id = p.id), '[]'::json)
                   ) order by p.sort_order) from wl_workout_parts p where p.workout_id = w.id), '[]'::json)
               ) order by w.number) from wl_workouts w where w.status <> 'draft'), '[]'::json),
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
  where w.status <> 'draft'
$$;

revoke all on function wl_public_leaderboard() from public;
revoke all on function wl_public_schedule() from public;
grant execute on function wl_public_leaderboard() to anon, authenticated;
grant execute on function wl_public_schedule() to anon, authenticated;
