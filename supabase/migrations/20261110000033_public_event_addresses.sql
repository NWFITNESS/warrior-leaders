-- Gyms & Events phase 4 (10 Nov 2026): public pages live under /{gym}/{event}.
-- * Every public function takes an optional p_event; without it they keep showing the gym's current event
--   (old links, old phones).
-- * wl_public_event(gym, event) and wl_public_gym(gym) look events up by their web addresses.
-- * Gym addresses can't take a name the site already uses (admin, judge, live…).

alter table wl_gyms add constraint wl_gyms_slug_not_reserved check (slug not in (
  'admin', 'judge', 'live', 'tv', 'dj', 'demo', 'schedule', 'workouts', 'teams', 'api', 'e', 'g', 'events',
  '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'login', 'signup', 'pricing', 'about', 'help'));

-- Event by its addresses. Archived events aren't public; drafts are (only their non-draft workouts show).
create or replace function public.wl_public_event(p_gym text, p_event text)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'id', c.id, 'slug', c.slug, 'name', c.name, 'short_name', c.short_name, 'venue', c.venue,
    'start_date', c.start_date, 'end_date', c.end_date, 'status', c.status,
    'gym', json_build_object('name', g.name, 'slug', g.slug, 'logo_url', g.logo_url),
    'is_current', g.current_competition_id = c.id)
  from wl_competitions c join wl_gyms g on g.id = c.gym_id
  where g.slug = p_gym and c.slug = p_event and c.status <> 'archived'
$$;

-- A gym and its public events, newest first; `current` is the one the old links go to
create or replace function public.wl_public_gym(p_gym text)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'name', g.name, 'slug', g.slug, 'logo_url', g.logo_url,
    'current', (select slug from wl_competitions where id = g.current_competition_id),
    'events', coalesce((select json_agg(json_build_object('slug', c.slug, 'name', c.name, 'short_name', c.short_name, 'venue', c.venue,
                                                          'start_date', c.start_date, 'end_date', c.end_date, 'status', c.status)
                                        order by c.start_date desc nulls last)
                        from wl_competitions c
                        where c.gym_id = g.id and (c.status in ('live', 'finished') or c.id = g.current_competition_id)), '[]'::json))
  from wl_gyms g where g.slug = p_gym
$$;
grant execute on function public.wl_public_event(text, text) to anon, authenticated;
grant execute on function public.wl_public_gym(text) to anon, authenticated;

-- Give each public function an optional p_event. The bodies are the phase 2 ones, with the current
-- event swapped for coalesce(p_event, current); the old no-event versions are dropped so calls stay unambiguous.
do $$
declare
  f record;
  def text;
  sigs text[][] := array[
    array['wl_public_settings', '', 'p_event uuid DEFAULT NULL::uuid'],
    array['wl_public_promo', '', 'p_event uuid DEFAULT NULL::uuid'],
    array['wl_public_heat_starts', '', 'p_event uuid DEFAULT NULL::uuid'],
    array['wl_public_teams', '', 'p_event uuid DEFAULT NULL::uuid'],
    array['wl_public_schedule', '', 'p_event uuid DEFAULT NULL::uuid'],
    array['wl_public_leaderboard', '', 'p_event uuid DEFAULT NULL::uuid'],
    array['wl_public_live', 'p_heat uuid DEFAULT NULL::uuid, p_fallback uuid DEFAULT NULL::uuid',
                            'p_heat uuid DEFAULT NULL::uuid, p_fallback uuid DEFAULT NULL::uuid, p_event uuid DEFAULT NULL::uuid']
  ];
  i int;
begin
  for i in 1..array_length(sigs, 1) loop
    select pg_get_functiondef(p.oid), p.oid::regprocedure::text as sig into f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = sigs[i][1];
    def := f.pg_get_functiondef;
    def := replace(def, 'public.' || sigs[i][1] || '(' || sigs[i][2] || ')', 'public.' || sigs[i][1] || '(' || sigs[i][3] || ')');
    def := replace(def, 'wl_current_competition()', 'coalesce(p_event, wl_current_competition())');
    if position('coalesce(p_event' in def) = 0 then raise exception '% has no current-event reference', sigs[i][1]; end if;
    execute 'drop function public.' || f.sig;
    execute def;
    execute format('grant execute on function public.%s(%s) to anon, authenticated', sigs[i][1],
                   regexp_replace(sigs[i][3], ' DEFAULT NULL::uuid', '', 'g'));
  end loop;
end $$;

-- Old team links (/teams/<id>, e.g. in emails) find their event's address
create or replace function public.wl_public_team_path(p_team uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select '/' || g.slug || '/' || c.slug
  from wl_teams t join wl_competitions c on c.id = t.competition_id join wl_gyms g on g.id = c.gym_id
  where t.id = p_team and c.status <> 'archived'
$$;
grant execute on function public.wl_public_team_path(uuid) to anon, authenticated;
