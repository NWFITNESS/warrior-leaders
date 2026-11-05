-- What runs along the bottom of the big screen (/live): DJ, rotating info slides, sponsor ticker.
-- Edited in Admin → Big screen; read publicly through wl_public_promo(). (Seeded from the Nov 2026 info booklet.)
alter table wl_competition_settings add column live_promo jsonb not null default '{}'::jsonb;

create or replace function wl_public_promo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select live_promo from wl_competition_settings where id = 1
$$;
grant execute on function wl_public_promo() to anon, authenticated;
