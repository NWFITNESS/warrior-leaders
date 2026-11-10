-- Gyms & Events phase 3 (10 Nov 2026): the judge's code says which event they're judging.
-- * Codes are unique across all open events (status draft or live), lane and head codes alike,
--   so a code always points at exactly one event. Finished/archived events can't be signed in to.
-- * Lane judges: name + code → the event with that judge code.
-- * Head judges: head code first (wl_judge_heads lists that event's head judges), then their name.
-- * The judge app is told which event it's on (wl_judge_assignments → event).

create or replace function public.wl_open_event_for_code(p_code text, p_head boolean)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from wl_competitions
  where status in ('draft', 'live') and case when p_head then head_judge_code else judge_code end = p_code
  limit 1
$$;
revoke all on function public.wl_open_event_for_code(text, boolean) from public, anon, authenticated;

-- A 4-digit code no open event uses
create or replace function public.wl_free_judge_code(p_not text default null)
returns text language plpgsql volatile security definer set search_path to 'public' as $$
declare c text;
begin
  for i in 1..500 loop
    c := lpad(floor(random() * 10000)::int::text, 4, '0');
    if c is distinct from p_not and not exists (
      select 1 from wl_competitions where status in ('draft', 'live') and (judge_code = c or head_judge_code = c)
    ) then return c; end if;
  end loop;
  raise exception 'no free judge codes';
end $$;
revoke all on function public.wl_free_judge_code(text) from public, anon;
grant execute on function public.wl_free_judge_code(text) to authenticated;

create or replace function public.wl_competitions_codes_check() returns trigger language plpgsql as $$
begin
  if new.judge_code = new.head_judge_code then
    raise exception 'judge_code_clash: the judge code and head judge code must be different';
  end if;
  if new.status in ('draft', 'live') and exists (
    select 1 from wl_competitions c
    where c.id <> new.id and c.status in ('draft', 'live')
      and (c.judge_code in (new.judge_code, new.head_judge_code) or c.head_judge_code in (new.judge_code, new.head_judge_code))
  ) then
    raise exception 'judge_code_taken: another open event already uses one of these codes';
  end if;
  return new;
end $$;
create trigger wl_competitions_codes_check before insert or update of judge_code, head_judge_code, status on wl_competitions
  for each row execute function wl_competitions_codes_check();

-- Lane judges: the code picks the event
create or replace function public.wl_judge_register(p_name text, p_code text)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_comp uuid;
  v_judge wl_judges;
  v_token uuid;
begin
  if length(v_name) < 2 or length(v_name) > 40 then
    return json_build_object('error', 'bad_name');
  end if;
  if (select count(*) from wl_judge_login_failures where judge_id is null and at > now() - interval '15 minutes') >= 40 then
    return json_build_object('error', 'locked');
  end if;
  v_comp := wl_open_event_for_code(p_code, false);
  if v_comp is null then
    insert into wl_judge_login_failures (judge_id) values (null);
    -- a head judge code typed into the lane form: point them the right way
    if wl_open_event_for_code(p_code, true) is not null then return json_build_object('error', 'head_code'); end if;
    return json_build_object('error', 'wrong_code');
  end if;
  if exists (select 1 from wl_judges where competition_id = v_comp and role = 'head' and active and lower(name) = lower(v_name)) then
    return json_build_object('error', 'head_name');
  end if;
  select * into v_judge from wl_judges where competition_id = v_comp and role = 'lane' and lower(name) = lower(v_name) order by active desc, created_at limit 1;
  if v_judge.id is not null and not v_judge.active then
    return json_build_object('error', 'inactive');
  end if;
  if v_judge.id is null then
    insert into wl_judges (name, role, competition_id) values (v_name, 'lane', v_comp) returning * into v_judge;
  end if;
  insert into wl_judge_sessions (judge_id, code) values (v_judge.id, p_code) returning token into v_token;
  return json_build_object('token', v_token);
end
$function$;

-- Head judges, step 1: the head code shows which event and its head judges
create or replace function public.wl_judge_heads(p_code text)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_comp uuid;
begin
  if (select count(*) from wl_judge_login_failures where judge_id is null and at > now() - interval '15 minutes') >= 40 then
    return json_build_object('error', 'locked');
  end if;
  v_comp := wl_open_event_for_code(p_code, true);
  if v_comp is null then
    insert into wl_judge_login_failures (judge_id) values (null);
    return json_build_object('error', 'wrong_code');
  end if;
  return json_build_object(
    'event', (select json_build_object('name', name, 'short_name', short_name) from wl_competitions where id = v_comp),
    'judges', coalesce((select json_agg(json_build_object('id', id, 'name', name) order by name)
                        from wl_judges where competition_id = v_comp and active and role = 'head'), '[]'::json));
end
$function$;
revoke all on function public.wl_judge_heads(text) from public;
grant execute on function public.wl_judge_heads(text) to anon, authenticated;

-- Head judges, step 2 (unchanged rule, now also needs the event to be open)
create or replace function public.wl_judge_login(p_judge uuid, p_code text)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role text;
  v_comp uuid;
  v_code text;
  v_fails int;
  v_token uuid;
begin
  select j.role, j.competition_id into v_role, v_comp
  from wl_judges j join wl_competitions c on c.id = j.competition_id and c.status in ('draft', 'live')
  where j.id = p_judge and j.active;
  if v_role is null then
    return json_build_object('error', 'unknown_judge');
  end if;
  select count(*) into v_fails from wl_judge_login_failures where judge_id = p_judge and at > now() - interval '15 minutes';
  if v_fails >= 8 then
    return json_build_object('error', 'locked');
  end if;
  select case when v_role = 'head' then head_judge_code else judge_code end into v_code from wl_competitions where id = v_comp;
  if p_code is distinct from v_code then
    insert into wl_judge_login_failures (judge_id) values (p_judge);
    return json_build_object('error', 'wrong_code');
  end if;
  insert into wl_judge_sessions (judge_id, code) values (p_judge, v_code) returning token into v_token;
  return json_build_object('token', v_token);
end
$function$;

-- The judge app shows which event it's on: wrap the existing payload with the event
alter function public.wl_judge_assignments(uuid) rename to wl_judge_assignments_core;
revoke all on function public.wl_judge_assignments_core(uuid) from public, anon, authenticated;
create or replace function public.wl_judge_assignments(p_token uuid)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  j wl_judges;
  v jsonb;
begin
  v := wl_judge_assignments_core(p_token)::jsonb;
  if v ? 'error' then return v::json; end if;
  j := wl_judge_from_token(p_token);
  return (v || jsonb_build_object('event',
    (select jsonb_build_object('id', id, 'name', name, 'short_name', short_name, 'start_date', start_date, 'end_date', end_date, 'status', status)
     from wl_competitions where id = j.competition_id)))::json;
end
$function$;
revoke all on function public.wl_judge_assignments(uuid) from public;
grant execute on function public.wl_judge_assignments(uuid) to anon, authenticated;
