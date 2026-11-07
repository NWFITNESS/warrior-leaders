-- Admin → Judges → "Clear practice scores": staff wipe scores for one event or all events,
-- optionally freeing the lanes judges have taken. Judges' sign-ins are never touched.
-- Phones drop their own copies of the cleared scores: wl_judge_assignments returns
-- 'score_resets' = { part_id: reset ms } and the phone deletes drafts older than that.
alter table wl_competition_settings add column if not exists score_resets jsonb not null default '{}'::jsonb; -- workout_id -> timestamptz

create or replace function wl_admin_reset_scores(p_workout uuid default null, p_free_lanes boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_parts uuid[];
  v_scores int; v_lanes int := 0;
begin
  if not wl_is_staff() then raise exception 'not allowed'; end if;
  select coalesce(array_agg(p.id), '{}') into v_parts from wl_workout_parts p where p_workout is null or p.workout_id = p_workout;

  delete from wl_score_events where score_id in (select id from wl_scores where part_id = any(v_parts));
  delete from wl_appeals where score_id in (select id from wl_scores where part_id = any(v_parts));
  delete from wl_scores where part_id = any(v_parts);
  get diagnostics v_scores = row_count;
  delete from wl_heat_starts where part_id = any(v_parts);
  delete from wl_releases where part_id = any(v_parts);

  if p_free_lanes then
    update wl_lane_assignments la set judge_id = null
    where la.judge_id is not null and (p_workout is null or la.heat_id in (select id from wl_heats where workout_id = p_workout));
    get diagnostics v_lanes = row_count;
  end if;

  if p_workout is null then
    update wl_competition_settings set scores_reset_at = now(), score_resets = '{}'::jsonb, live_heat_id = null where id = 1;
  else
    update wl_competition_settings set score_resets = score_resets || jsonb_build_object(p_workout::text, now()) where id = 1;
  end if;

  return json_build_object('scores', v_scores, 'lanes', v_lanes);
end $$;
revoke all on function wl_admin_reset_scores(uuid, boolean) from public, anon;
grant execute on function wl_admin_reset_scores(uuid, boolean) to authenticated;

-- wl_judge_assignments: per-part reset times (global reset or that event's reset, whichever is later).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.wl_judge_assignments(uuid)'::regprocedure);
  if position('score_resets' in d) = 0 then
    d := replace(d, $r$'judge', json_build_object($r$,
      $r$'score_resets', (select coalesce(json_object_agg(p.id, (extract(epoch from greatest(s.scores_reset_at, (s.score_resets ->> p.workout_id::text)::timestamptz)) * 1000)::bigint)
                              filter (where s.scores_reset_at is not null or s.score_resets ? p.workout_id::text), '{}'::json)
                          from wl_workout_parts p cross join wl_competition_settings s where s.id = 1),
    'judge', json_build_object($r$);
    execute d;
  end if;
end $$;
