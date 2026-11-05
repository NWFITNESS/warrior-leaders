-- The competition athletes are entering (emails lead with this; Warrior Leaders is the platform, shown as "Powered by").
alter table wl_competition_settings add column competition_name text not null default 'Northern Warrior Competitions - Same-sex Pairs 2026';
