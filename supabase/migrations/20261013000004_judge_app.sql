-- Judge app: judges have no Supabase account. They pick their name and enter the day's
-- judge code; that creates a session token. Every judge call goes through a SECURITY DEFINER
-- function that checks the token AND that the code hasn't changed since sign-in
-- (so changing the code in Settings signs every judge out).

create table wl_judge_sessions (
  token       uuid primary key default gen_random_uuid(),
  judge_id    uuid not null references wl_judges(id) on delete cascade,
  code        text not null,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create table wl_judge_login_failures (
  id        bigint generated always as identity primary key,
  judge_id  uuid references wl_judges(id) on delete cascade,
  at        timestamptz not null default now()
);
create index wl_judge_login_failures_idx on wl_judge_login_failures(judge_id, at);

alter table wl_judge_sessions enable row level security;
alter table wl_judge_login_failures enable row level security;
create policy "wl staff full access" on wl_judge_sessions for all to authenticated using (wl_is_staff()) with check (wl_is_staff());
create policy "wl staff full access" on wl_judge_login_failures for all to authenticated using (wl_is_staff()) with check (wl_is_staff());

-- Resolve a token to an active judge, or null.
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
  join wl_competition_settings c on c.id = 1 and c.judge_code = s.code
  where s.token = p_token
$$;
revoke all on function wl_judge_from_token(uuid) from public, anon, authenticated;

-- Names for the sign-in list.
create or replace function wl_judge_list()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object('id', id, 'name', name, 'role', role) order by name), '[]'::json)
  from wl_judges where active
$$;

-- Sign in. 8 wrong codes in 15 minutes locks that judge out for the rest of the window.
create or replace function wl_judge_login(p_judge uuid, p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_fails int;
  v_token uuid;
begin
  if not exists (select 1 from wl_judges where id = p_judge and active) then
    return json_build_object('error', 'unknown_judge');
  end if;
  select count(*) into v_fails from wl_judge_login_failures where judge_id = p_judge and at > now() - interval '15 minutes';
  if v_fails >= 8 then
    return json_build_object('error', 'locked');
  end if;
  select judge_code into v_code from wl_competition_settings where id = 1;
  if p_code is distinct from v_code then
    insert into wl_judge_login_failures (judge_id) values (p_judge);
    return json_build_object('error', 'wrong_code');
  end if;
  insert into wl_judge_sessions (judge_id, code) values (p_judge, v_code) returning token into v_token;
  return json_build_object('token', v_token);
end
$$;

create or replace function wl_judge_logout(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from wl_judge_sessions where token = p_token
$$;

-- Everything a judge needs for their lanes (head judges see every lane).
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
            'part_movements', coalesce((select json_agg(json_build_object(
                'id', m.id, 'sort_order', m.sort_order, 'name', m.name, 'reps', m.reps, 'reps_female', m.reps_female,
                'rx_load', m.rx_load, 'scaled_load', m.scaled_load, 'standards', m.standards) order by m.sort_order)
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

-- Save a draft or submit a score. Rejected once the head judge has verified it.
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
                              tiebreak_value, entries, splits, signed_by, submitted_at, updated_at)
  values (p_part, v_team, p_lane_assignment, j.id, v_status, 'judge',
          coalesce((p_score->>'capped')::boolean, false),
          nullif(p_score->>'value', '')::numeric,
          nullif(p_score->>'reps', '')::int,
          nullif(p_score->>'rounds', '')::int,
          nullif(p_score->>'tiebreak_value', '')::numeric,
          coalesce((p_score->'entries')::jsonb, '{}'::jsonb),
          coalesce((p_score->'splits')::jsonb, '[]'::jsonb),
          p_score->>'signed_by',
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

revoke all on function wl_judge_list() from public;
revoke all on function wl_judge_login(uuid, text) from public;
revoke all on function wl_judge_logout(uuid) from public;
revoke all on function wl_judge_assignments(uuid) from public;
revoke all on function wl_judge_save_score(uuid, uuid, uuid, json) from public;
grant execute on function wl_judge_list() to anon, authenticated;
grant execute on function wl_judge_login(uuid, text) to anon, authenticated;
grant execute on function wl_judge_logout(uuid) to anon, authenticated;
grant execute on function wl_judge_assignments(uuid) to anon, authenticated;
grant execute on function wl_judge_save_score(uuid, uuid, uuid, json) to anon, authenticated;
