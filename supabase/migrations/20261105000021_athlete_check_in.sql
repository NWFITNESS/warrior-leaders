-- Morning registration (Admin → Check-in on a tablet): when each athlete arrived and who checked them in.
alter table wl_athletes add column checked_in_at timestamptz, add column checked_in_by text;
