import Link from 'next/link'
import { requireEvent } from '@/lib/event'
import { buildEvents, divisionStandings, type RankScore, type RankWorkout } from '@/lib/ranking'
import type { Sex } from '@/lib/scoring'
import type { PointsMethod } from '@/lib/types'
import { FinalBuilder, type FinalDivision } from './final-builder'

export const metadata = { title: 'Final heats' }
export const dynamic = 'force-dynamic'

/** The final: take the top N of each division (current overall standings, all verified scores
 *  before the final) and lay them out as heats for the final workout. */
export default async function FinalPage({ searchParams }: { searchParams: Promise<{ workout?: string }> }) {
  const { workout: workoutParam } = await searchParams
  const { supabase, event } = await requireEvent()
  const [{ data: settings }, { data: divisions }, { data: teams }, { data: workouts }, { data: scores }] = await Promise.all([
    Promise.resolve({ data: { points_method: event.points_method, custom_points: event.custom_points, lanes_per_heat: event.lanes_per_heat } }),
    supabase.from('wl_divisions').select('id, name, sex, level, sort_order').eq('competition_id', event.id).order('sort_order'),
    supabase.from('wl_teams').select('id, name, division_id').eq('competition_id', event.id).order('name'),
    supabase.from('wl_workouts').select('id, number, name, status, open_entry, combine_parts, heat_minutes, parts:wl_workout_parts(*, part_movements:wl_part_movements!wl_part_movements_part_id_fkey(*))').eq('competition_id', event.id).order('number'),
    supabase.from('wl_scores').select('part_id, team_id, value, tiebreak_value, capped, entries, team:wl_teams!inner(competition_id)').eq('status', 'verified').eq('team.competition_id', event.id),
  ])

  const candidates = (workouts ?? []).filter((w) => !w.open_entry)
  const final = candidates.find((w) => w.id === workoutParam) ?? candidates[candidates.length - 1]
  if (!final) return <div className="empty">Create the final workout first.</div>

  // qualifying = every event before the final
  const qualifying = (workouts ?? []).filter((w) => w.number < final.number)
  const events = buildEvents(qualifying as unknown as RankWorkout[])
  const method = (settings?.points_method ?? 'placing') as PointsMethod
  const scoreCount = (scores ?? []).filter((s) => qualifying.some((w) => w.parts.some((p: { id: string }) => p.id === s.part_id))).length

  const board: FinalDivision[] = (divisions ?? []).map((d) => {
    const { standings } = divisionStandings({
      division: { id: d.id, name: d.name, sex: d.sex as Sex, level: d.level }, teams: teams ?? [], events,
      scores: (scores ?? []) as RankScore[], releases: 'all', method, custom: settings?.custom_points ?? [],
    })
    return {
      id: d.id, name: d.name, level: d.level,
      standings: standings.map((s) => ({ teamId: s.team.id, team: s.team.name, rank: s.rank, total: s.total, scored: Object.values(s.results).filter((r) => r.scored).length })),
    }
  })

  const { data: existing } = await supabase.from('wl_heats').select('id, number, start_time').eq('workout_id', final.id).order('number')
  const capSecs = final.parts.reduce((n: number, p: { time_cap_seconds: number | null; score_type: string; rounds: number }) =>
    n + (p.time_cap_seconds ?? 0) * (p.score_type === 'for_time' ? Math.max(1, p.rounds) : 1), 0)

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">On the day</span>
          <h1>Final heats</h1>
          <p className="muted small" style={{ maxWidth: '70ch' }}>
            Takes the top teams in each division from the overall standings (every verified score from Events{' '}
            {qualifying.map((w) => w.number).join(', ')}) and puts them into heats for{' '}
            <b>Event {final.number} · {final.name}</b>. Choose how many go through per division, check the heats, then save.
            Re-open this page after the last scores are verified to refresh the standings.
          </p>
        </div>
        <div className="row">
          {candidates.length > 1 && (
            <form className="row">
              <select name="workout" defaultValue={final.id} className="input" style={{ width: 'auto' }} aria-label="Final workout">
                {candidates.map((w) => <option key={w.id} value={w.id}>Event {w.number} · {w.name}</option>)}
              </select>
              <button className="btn btn-ghost btn-sm">Switch</button>
            </form>
          )}
          <Link href={`/admin/heats?workout=${final.id}`} className="btn btn-ghost btn-sm">Open in Heats &amp; lanes</Link>
        </div>
      </div>

      {scoreCount === 0 && (
        <p className="notice">No verified scores yet, so every team is level and the order below is alphabetical. It fills in properly once scores are verified.</p>
      )}

      <FinalBuilder
        key={final.id}
        workoutId={final.id}
        divisions={board}
        lanesPerHeat={settings?.lanes_per_heat ?? 5}
        heatMinutes={final.heat_minutes ?? (Math.ceil(capSecs / 60) || 15)}
        firstStart={existing?.[0]?.start_time?.slice(0, 5) ?? '16:00'}
        existingHeats={existing?.length ?? 0}
      />
    </>
  )
}
