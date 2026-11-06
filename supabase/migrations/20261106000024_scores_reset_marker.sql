-- Scores reset marker: when scores are wiped (e.g. after the judges' demo), judges' phones drop any
-- drafts / unsent scores saved before this time, so old demo scores can't reappear or re-upload.
alter table wl_competition_settings add column if not exists scores_reset_at timestamptz;

-- wl_judge_assignments also returns 'scores_reset_at' (ms since epoch).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.wl_judge_assignments(uuid)'::regprocedure);
  if position('scores_reset_at' in d) = 0 then
    d := replace(d, $r$'judge', json_build_object($r$,
      $r$'scores_reset_at', (select (extract(epoch from scores_reset_at) * 1000)::bigint from wl_competition_settings where id = 1),
    'judge', json_build_object($r$);
    execute d;
  end if;
end $$;
