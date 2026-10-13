import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { HeatsEditor } from './heats-editor'

export const metadata = { title: 'Heats & lanes' }

export default async function HeatsPage({ searchParams }: { searchParams: Promise<{ workout?: string }> }) {
  const { workout: workoutParam } = await searchParams
  const { supabase } = await requireStaff()
  const [{ data: workouts }, { data: settings }, { data: divisions }, { data: teams }, { data: judges }] = await Promise.all([
    supabase.from('wl_workouts').select('id, number, name, status, description, parts:wl_workout_parts(id, label, name, sort_order, score_type, direction, time_cap_seconds, rounds, scored, part_movements:wl_part_movements(id, sort_order, name, reps, reps_female, rx_load, scaled_load))').order('number'),
    supabase.from('wl_competition_settings').select('lanes_per_heat').single(),
    supabase.from('wl_divisions').select('id, name, sort_order, level, sex').order('sort_order'),
    supabase.from('wl_teams').select('id, name, bib, division_id').order('name'),
    supabase.from('wl_judges').select('id, name, role, active').eq('active', true).order('name'),
  ])

  if (!workouts?.length) {
    return (
      <>
        <div className="stack-sm"><span className="eyebrow">Floor</span><h1>Heats &amp; lanes</h1></div>
        <div className="empty">Create a workout first, then set up its heats here. <Link href="/admin/workouts">Go to workouts</Link></div>
      </>
    )
  }

  const workout = workouts.find((w) => w.id === workoutParam) ?? workouts[0]
  const { data: heats } = await supabase
    .from('wl_heats')
    .select('id, number, start_time, lanes:wl_lane_assignments(lane, team_id, judge_id)')
    .eq('workout_id', workout.id)
    .order('number')

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">Floor</span>
          <h1>Heats &amp; lanes</h1>
        </div>
      </div>
      <nav className="seg" aria-label="Workout">
        {workouts.map((w) => (
          <Link key={w.id} href={`/admin/heats?workout=${w.id}`} className="btn btn-ghost btn-sm"
            style={w.id === workout.id ? { borderColor: 'var(--gold)', color: 'var(--gold-hi)', background: 'rgba(150,119,5,0.12)' } : undefined}>
            Event {w.number} · {w.name}
          </Link>
        ))}
      </nav>
      {workout.status === 'draft' && (
        <p className="notice">
          Event {workout.number} is a <b>draft</b>, so judges can’t see it yet. Set its status to <b>Ready</b> on the{' '}
          <Link href={`/admin/workouts/${workout.id}`}>workout page</Link> when the heats are done.
        </p>
      )}
      <HeatsEditor
        key={workout.id}
        workoutId={workout.id}
        workout={workout}
        lanesPerHeat={settings?.lanes_per_heat ?? 6}
        divisions={divisions ?? []}
        teams={teams ?? []}
        judges={judges ?? []}
        initial={(heats ?? []).map((h) => ({ id: h.id, number: h.number, start_time: h.start_time?.slice(0, 5) ?? null, lanes: h.lanes }))}
      />
    </>
  )
}
