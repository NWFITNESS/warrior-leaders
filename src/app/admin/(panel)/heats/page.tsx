import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { HeatsEditor } from './heats-editor'
import { setLiveHeat } from './actions'

export const metadata = { title: 'Heats & lanes' }

export default async function HeatsPage({ searchParams }: { searchParams: Promise<{ workout?: string }> }) {
  const { workout: workoutParam } = await searchParams
  const { supabase } = await requireStaff()
  const [{ data: workouts }, { data: settings }, { data: divisions }, { data: teams }, { data: judges }] = await Promise.all([
    supabase.from('wl_workouts').select('id, number, name, status, description, parts:wl_workout_parts(id, label, name, sort_order, score_type, direction, time_cap_seconds, rounds, scored, part_movements:wl_part_movements(*))').order('number'),
    supabase.from('wl_competition_settings').select('lanes_per_heat, live_heat_id').single(),
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

  // every heat of every workout, for the big-screen picker
  const { data: allHeats } = await supabase.from('wl_heats').select('id, number, start_time, workout:wl_workouts(number, name)').order('start_time', { nullsFirst: false })
  const pinned = settings?.live_heat_id ?? ''

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">Floor</span>
          <h1>Heats &amp; lanes</h1>
        </div>
      </div>
      <section className="card stack-sm">
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <b>Big screen</b>
          <span className="row" style={{ gap: 12 }}>
            <a href="/live" target="_blank" rel="noreferrer">Race + heat times ↗</a>
            <a href="/live?view=race" target="_blank" rel="noreferrer">Race only ↗</a>
            <a href="/tv" target="_blank" rel="noreferrer">Leaderboard ↗</a>
          </span>
        </div>
        <form action={setLiveHeat} className="row" style={{ gap: 8, alignItems: 'center' }}>
          <select name="heat" className="input" defaultValue={pinned} key={pinned} style={{ maxWidth: 420 }} aria-label="Heat on the big screen">
            <option value="">Automatic: follow the judges</option>
            {(allHeats ?? []).map((h) => {
              const w = (Array.isArray(h.workout) ? h.workout[0] : h.workout) as { number: number; name: string } | null
              return <option key={h.id} value={h.id}>{h.start_time?.slice(0, 5) ?? 'TBC'} · Event {w?.number} · Heat {h.number}</option>
            })}
          </select>
          <button className="btn btn-sm">Show on screen</button>
        </form>
        <span className="small subtle">
          Automatic shows the heat the judges are scoring right now (or the next heat by the clock). Pick a heat to hold it on screen, e.g. during the lane intro.
        </span>
      </section>
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
