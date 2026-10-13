-- Timed rounds: a for-time part can be N windows of time_cap_seconds each.
-- Each window is timed separately; the part's score is the sum of the window times.
alter table wl_workout_parts
  add column rounds int not null default 1 check (rounds between 1 and 20),
  -- what an unfinished window counts as: the window time plus 1 second per rep missed, or just the window time
  add column capped_round_rule text not null default 'cap_plus_reps'
    check (capped_round_rule in ('cap_plus_reps', 'cap_only'));

-- Divisions are single-sex, so movements can have different reps for female divisions (e.g. 21/18 cal).
-- null = same as reps.
alter table wl_part_movements
  add column reps_female int;
