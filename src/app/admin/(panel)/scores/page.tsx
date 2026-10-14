import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { buildEvents, type RankWorkout } from '@/lib/ranking'
import type { Sex } from '@/lib/scoring'
import type { WorkoutPart } from '@/lib/types'
import { ScoresBoard, type BoardRow } from './scores-board'

export const metadata = { title: 'Scores' }
export const dynamic = 'force-dynamic'

export default async function ScoresPage({ searchParams }: { searchParams: Promise<{ workout?: string }> }) {
  const { workout: workoutParam } = await searchParams
  const { supabase } = await requireStaff()
  const { data: workouts } = await supabase.from('wl_workouts').select('id, number, name, combine_parts').order('number')
  if (!workouts?.length) {
    return (<><div className="stack-sm"><span className="eyebrow">Results</span><h1>Scores</h1></div><div className="empty">No workouts yet.</div></>)
  }
  const workout = workouts.find((w) => w.id === workoutParam) ?? workouts[0]

  const [{ data: parts }, { data: lanes }, { data: divisions }, { data: teams }] = await Promise.all([
    supabase.from('wl_workout_parts').select('*, part_movements:wl_part_movements(*)').eq('workout_id', workout.id).order('sort_order'),
    supabase.from('wl_lane_assignments')
      .select('lane, team_id, heat:wl_heats!inner(number, workout_id), judge:wl_judges(name)')
      .eq('heat.workout_id', workout.id),
    supabase.from('wl_divisions').select('id, name, sex, level').order('sort_order'),
    supabase.from('wl_teams').select('id, name, division_id').order('name'),
  ])
  const partIds = (parts ?? []).map((p) => p.id)
  const [{ data: scores }, { data: releases }] = await Promise.all([
    partIds.length ? supabase.from('wl_scores').select('*, judge:wl_judges(name), appeals:wl_appeals(*)').in('part_id', partIds) : Promise.resolve({ data: [] as never[] }),
    partIds.length ? supabase.from('wl_releases').select('part_id, division_id, released_at').in('part_id', partIds) : Promise.resolve({ data: [] as never[] }),
  ])

  type LaneRow = { lane: number; team_id: string | null; heat: { number: number }; judge: { name: string } | null }
  const laneByTeam = new Map(((lanes ?? []) as unknown as LaneRow[]).filter((l) => l.team_id).map((l) => [l.team_id!, l]))
  const divById = new Map((divisions ?? []).map((d) => [d.id, d]))

  // every team that's in a heat for this workout or already has a score for it
  const teamIds = new Set<string>([...laneByTeam.keys(), ...((scores ?? []) as { team_id: string }[]).map((s) => s.team_id)])
  const rows: BoardRow[] = (teams ?? [])
    .filter((t) => teamIds.has(t.id))
    .map((t) => {
      const l = laneByTeam.get(t.id)
      const d = divById.get(t.division_id)!
      return { teamId: t.id, teamName: t.name, divisionId: d.id, divisionName: d.name, sex: d.sex as Sex, level: d.level, heat: l?.heat.number ?? null, lane: l?.lane ?? null, judge: l?.judge?.name ?? null }
    })
    .sort((a, b) => (a.heat ?? 999) - (b.heat ?? 999) || (a.lane ?? 0) - (b.lane ?? 0) || a.teamName.localeCompare(b.teamName))

  const events = buildEvents([{ ...workout, parts: (parts ?? []) as RankWorkout['parts'] }])
  const others = (teams ?? []).filter((t) => !teamIds.has(t.id)).map((t) => ({ id: t.id, name: t.name, divisionId: t.division_id }))

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">Results</span>
          <h1>Scores</h1>
          <p className="small muted" style={{ maxWidth: '70ch' }}>
            Check each score, then release the results for each division. Nothing appears on the public leaderboard until it’s released.
          </p>
        </div>
        <Link href={`/admin/scores?workout=${workout.id}`} className="btn btn-ghost">Refresh</Link>
      </div>
      <nav className="seg" aria-label="Workout">
        {workouts.map((w) => (
          <Link key={w.id} href={`/admin/scores?workout=${w.id}`} className="btn btn-ghost btn-sm"
            style={w.id === workout.id ? { borderColor: 'var(--gold)', color: 'var(--gold-hi)', background: 'rgba(150,119,5,0.12)' } : undefined}>
            Event {w.number} · {w.name}
          </Link>
        ))}
      </nav>
      <ScoresBoard
        key={workout.id}
        workoutNumber={workout.number}
        parts={(parts ?? []) as (WorkoutPart & { id: string })[]}
        events={events.map((e) => ({ key: e.key, label: e.label, title: e.title, partIds: e.parts.map((p) => p.id) }))}
        divisions={(divisions ?? []).map((d) => ({ id: d.id, name: d.name }))}
        rows={rows}
        scores={(scores ?? []) as never}
        releases={releases ?? []}
        otherTeams={others}
      />
    </>
  )
}
