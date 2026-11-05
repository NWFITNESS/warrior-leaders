-- One official start per heat (and round): the first judge to start sets it; judges in the same heat
-- who start within a few seconds snap to it (client side), so every lane runs on the same clock.
-- wl_server_now(): judges' phones correct their clocks against the server.
-- (Full SQL applied via Supabase MCP: table wl_heat_starts, functions wl_judge_heat_start, wl_server_now.)
create table wl_heat_starts (
  heat_id    uuid not null references wl_heats(id) on delete cascade,
  part_id    uuid not null references wl_workout_parts(id) on delete cascade,
  round      int not null default 1,
  started_at timestamptz not null,
  primary key (heat_id, part_id, round)
);
alter table wl_heat_starts enable row level security;
create policy "wl staff full access" on wl_heat_starts for all to authenticated using (wl_is_staff()) with check (wl_is_staff());

create or replace function wl_judge_heat_start(p_token uuid, p_lane uuid, p_part uuid, p_round int, p_started_ms bigint)
returns json language plpgsql security definer set search_path = public as $$
declare j wl_judges; v_heat uuid; v_open boolean; v_start timestamptz; v_mine timestamptz;
begin
  j := wl_judge_from_token(p_token);
  if j.id is null then return json_build_object('error', 'signed_out'); end if;
  select h.id, w.open_entry into v_heat, v_open
  from wl_lane_assignments la join wl_heats h on h.id = la.heat_id join wl_workouts w on w.id = h.workout_id
  where la.id = p_lane and exists (select 1 from wl_workout_parts p where p.id = p_part and p.workout_id = w.id);
  if v_heat is null or v_open then return json_build_object('synced', false); end if;
  v_mine := to_timestamp(p_started_ms / 1000.0);
  if abs(extract(epoch from (v_mine - now()))) > 120 then v_mine := now(); end if;
  insert into wl_heat_starts (heat_id, part_id, round, started_at) values (v_heat, p_part, coalesce(p_round, 1), v_mine)
  on conflict (heat_id, part_id, round) do nothing;
  select started_at into v_start from wl_heat_starts where heat_id = v_heat and part_id = p_part and round = coalesce(p_round, 1);
  if v_mine > v_start + interval '30 seconds' then
    update wl_heat_starts set started_at = v_mine where heat_id = v_heat and part_id = p_part and round = coalesce(p_round, 1);
    v_start := v_mine;
  end if;
  return json_build_object('synced', true, 'heat_started_ms', round(extract(epoch from v_start) * 1000));
end $$;
revoke all on function wl_judge_heat_start(uuid, uuid, uuid, int, bigint) from public;
grant execute on function wl_judge_heat_start(uuid, uuid, uuid, int, bigint) to anon, authenticated;

create or replace function wl_server_now() returns bigint language sql stable as $$ select round(extract(epoch from now()) * 1000)::bigint $$;
grant execute on function wl_server_now() to anon, authenticated;
