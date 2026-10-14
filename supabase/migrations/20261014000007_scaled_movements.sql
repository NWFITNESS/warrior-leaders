-- Full Scaled version per movement. Blank (null) = same as RX.
alter table wl_part_movements
  add column scaled_name text,
  add column scaled_reps int,
  add column scaled_reps_female int,
  add column scaled_standards text;

-- Judge + public functions now send every movement column (so new fields flow through automatically).
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
        'workout', json_build_object('id', w.id, 'number', w.number, 'name', w.name, 'description', w.description, 'status', w.status),
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
            'part_movements', coalesce((select json_agg((to_jsonb(m) - 'part_id') order by m.sort_order)
              from wl_part_movements m where m.part_id = p.id), '[]'::json)
          ) order by p.sort_order)
          from wl_workout_parts p where p.workout_id = w.id
        ), '[]'::json),
        'scores', coalesce((
          select json_agg(json_build_object('part_id', s.part_id, 'status', s.status, 'value', s.value, 'capped', s.capped,
                                            'entries', s.entries, 'splits', s.splits, 'signed_by', s.signed_by, 'updated_at', s.updated_at))
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
    ), '[]'::json)
  );
end
$$;

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
                     'part_movements', coalesce((select json_agg((to_jsonb(m) - 'part_id') order by m.sort_order)
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
