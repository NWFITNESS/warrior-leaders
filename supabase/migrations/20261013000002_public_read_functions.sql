-- Public read access without a service-role key.
-- These SECURITY DEFINER functions return only non-sensitive columns
-- (no emails or phone numbers) and are the only thing anon can call.

create or replace function wl_public_settings()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('name', name, 'event_date', event_date, 'venue', venue)
  from wl_competition_settings where id = 1
$$;

create or replace function wl_public_teams()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'divisions', coalesce((
      select json_agg(json_build_object('id', d.id, 'name', d.name) order by d.sort_order)
      from wl_divisions d
    ), '[]'::json),
    'teams', coalesce((
      select json_agg(json_build_object(
        'id', t.id, 'name', t.name, 'bib', t.bib, 'division_id', t.division_id,
        'athletes', coalesce((
          select json_agg(json_build_object('first_name', a.first_name, 'last_name', a.last_name, 'position', a.position) order by a.position)
          from wl_athletes a where a.team_id = t.id
        ), '[]'::json)
      ) order by t.name)
      from wl_teams t
    ), '[]'::json)
  )
$$;

revoke all on function wl_public_settings() from public;
revoke all on function wl_public_teams() from public;
grant execute on function wl_public_settings() to anon, authenticated;
grant execute on function wl_public_teams() to anon, authenticated;
