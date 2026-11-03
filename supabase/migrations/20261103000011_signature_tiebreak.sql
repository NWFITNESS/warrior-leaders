-- Captain signature on judge scores + automatic tiebreaks.
--   wl_scores.signature: the captain's signature as an SVG path (viewBox 0 0 300 120), drawn on the judge's phone
--   wl_workout_parts.tiebreak_rule: none | manual (judge types it) | fastest_round | movement (time the chosen movement was ticked, round 1)

alter table wl_scores add column signature text;

alter table wl_workout_parts
  add column tiebreak_rule text not null default 'none' check (tiebreak_rule in ('none', 'manual', 'fastest_round', 'movement')),
  add column tiebreak_movement_id uuid references wl_part_movements(id) on delete set null;

-- parts that already had a tiebreak description keep the judge typing it in
update wl_workout_parts set tiebreak_rule = 'manual' where coalesce(trim(tiebreak_note), '') <> '';

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
    ), '[]'::json)
  );
end
$$;

create or replace function wl_judge_save_score(p_token uuid, p_lane_assignment uuid, p_part uuid, p_score json)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
  from wl_lane_assignments la join wl_heats h on h.id = la.heat_id
  where la.id = p_lane_assignment and (la.judge_id = j.id or j.role = 'head');
  if v_team is null or not v_ok then
    return json_build_object('error', 'not_your_lane');
  end if;

  select * into v_existing from wl_scores where part_id = p_part and team_id = v_team;
  if v_existing.status in ('verified', 'rejected') then
    return json_build_object('error', 'locked', 'status', v_existing.status);
  end if;
  -- a draft arriving late from an offline phone must not reopen a submitted score
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
          nullif(left(p_score->>'signature', 20000), ''), -- an SVG path, capped in size
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

  -- time-stamped judge actions (ticks, starts, caps) for the audit trail
  for e in select * from json_array_elements(coalesce(p_score->'events', '[]'::json)) loop
    insert into wl_score_events (score_id, judge_id, kind, payload, client_ts)
    values (v_id, j.id, coalesce(e->>'kind', 'event'), coalesce((e->'payload')::jsonb, '{}'::jsonb), nullif(e->>'at', '')::timestamptz);
  end loop;

  return json_build_object('ok', true, 'id', v_id, 'status', v_status);
end
$$;
