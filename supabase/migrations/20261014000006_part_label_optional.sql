-- Part letters are optional: blank means no "Part A" anywhere.
alter table wl_workout_parts alter column label set default '';
-- Event 1 was created with an automatic 'A' that the organiser never typed.
update wl_workout_parts set label = ''
where label = 'A' and workout_id in (select id from wl_workouts where number = 1)
  and (select count(*) from wl_workout_parts p2 where p2.workout_id = wl_workout_parts.workout_id) = 1;
