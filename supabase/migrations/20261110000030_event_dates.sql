-- Events run over one or more days: a start and an end date instead of a single event_date.
alter table wl_competitions rename column event_date to start_date;
alter table wl_competitions add column end_date date;
update wl_competitions set end_date = start_date where end_date is null;
alter table wl_competitions add constraint wl_competitions_dates_check check (end_date is null or start_date is null or end_date >= start_date);
