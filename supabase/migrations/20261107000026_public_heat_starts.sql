-- DJ screen runs live: when the judges actually started each heat (round 1 of its first part), epoch ms.
create or replace function wl_public_heat_starts() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(heat_id, ms), '{}'::json) from (
    select heat_id, round(extract(epoch from min(started_at)) * 1000)::bigint ms
    from wl_heat_starts where round = 1 group by heat_id
  ) x
$$;
revoke all on function wl_public_heat_starts() from public;
grant execute on function wl_public_heat_starts() to anon, authenticated;
