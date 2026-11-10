-- Every lane follows the heat's clock (10 Nov 2026)
-- * wl_judge_heat_clock: a judge's phone asks for the heat's official start(s), so a lane that hasn't
--   pressed start starts itself on the first judge's start.
-- * wl_judge_heat_start gains p_restart: a judge who wiped the round and started again (a heat re-run)
--   moves the official start even while other lanes are still on the old one.

drop function if exists public.wl_judge_heat_start(uuid, uuid, uuid, integer, bigint);

create or replace function public.wl_judge_heat_start(p_token uuid, p_lane uuid, p_part uuid, p_round integer, p_started_ms bigint, p_restart boolean default false)
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
    if coalesce(p_restart, false) then
      v_others := false; -- a re-run: this restart is the new official start
    else
      -- just late? keep the heat's start while another lane is still running on it
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
    end if;
    if not coalesce(v_others, false) then
      update wl_heat_starts set started_at = v_mine where heat_id = v_heat and part_id = p_part and round = v_round;
      v_start := v_mine;
    end if;
  end if;
  return json_build_object('synced', true, 'heat_started_ms', round(extract(epoch from v_start) * 1000));
end
$function$;
revoke all on function public.wl_judge_heat_start(uuid, uuid, uuid, integer, bigint, boolean) from public;
grant execute on function public.wl_judge_heat_start(uuid, uuid, uuid, integer, bigint, boolean) to anon, authenticated;

-- The heat's official start for each round of this part: { "1": ms, "2": ms }
create or replace function public.wl_judge_heat_clock(p_token uuid, p_lane uuid, p_part uuid)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare j wl_judges; v_heat uuid;
begin
  j := wl_judge_from_token(p_token);
  if j.id is null then
    return json_build_object('error', 'signed_out');
  end if;
  select la.heat_id into v_heat from wl_lane_assignments la where la.id = p_lane;
  if v_heat is null then return json_build_object('starts', '{}'::json); end if;
  return json_build_object(
    'now_ms', round(extract(epoch from now()) * 1000),
    'starts', coalesce((select json_object_agg(hs.round, round(extract(epoch from hs.started_at) * 1000))
                        from wl_heat_starts hs where hs.heat_id = v_heat and hs.part_id = p_part), '{}'::json));
end
$function$;
revoke all on function public.wl_judge_heat_clock(uuid, uuid, uuid) from public;
grant execute on function public.wl_judge_heat_clock(uuid, uuid, uuid) to anon, authenticated;
