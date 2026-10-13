import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { computeScore, type Entries, type Sex } from '@/lib/scoring'
import type { WorkoutPart } from '@/lib/types'

export const metadata = { title: 'Scores' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = { draft: 'pill-warn', submitted: 'pill-gold', verified: 'pill-ok', appeal: 'pill-bad', rejected: 'pill-bad' }
const LABEL: Record<string, string> = { draft: 'Scoring', submitted: 'Awaiting check', verified: 'Verified', appeal: 'Appeal', rejected: 'Rejected' }

export default async function ScoresPage({ searchParams }: { searchParams: Promise<{ workout?: string }> }) {
  const { workout: workoutParam } = await searchParams
  const { supabase } = await requireStaff()
  const { data: workouts } = await supabase.from('wl_workouts').select('id, number, name').order('number')
  if (!workouts?.length) {
    return (<><div className="stack-sm"><span className="eyebrow">Results</span><h1>Scores</h1></div><div className="empty">No workouts yet.</div></>)
  }
  const workout = workouts.find((w) => w.id === workoutParam) ?? workouts[0]

  const [{ data: parts }, { data: lanes }] = await Promise.all([
    supabase.from('wl_workout_parts').select('*, part_movements:wl_part_movements(*)').eq('workout_id', workout.id).order('sort_order'),
    supabase.from('wl_lane_assignments')
      .select('id, lane, heat:wl_heats!inner(number, start_time, workout_id), team:wl_teams(id, name, division:wl_divisions(name, sex)), judge:wl_judges(name)')
      .eq('heat.workout_id', workout.id),
  ])
  const partIds = (parts ?? []).map((p) => p.id)
  const { data: scores } = partIds.length
    ? await supabase.from('wl_scores').select('*, judge:wl_judges(name)').in('part_id', partIds)
    : { data: [] }

  type LaneRow = { id: string; lane: number; heat: { number: number; start_time: string | null }; team: { id: string; name: string; division: { name: string; sex: Sex } } | null; judge: { name: string } | null }
  const rows = ((lanes ?? []) as unknown as LaneRow[])
    .filter((l) => l.team)
    .sort((a, b) => a.heat.number - b.heat.number || a.lane - b.lane)

  const counts = { draft: 0, submitted: 0, verified: 0 } as Record<string, number>
  for (const s of scores ?? []) counts[s.status] = (counts[s.status] ?? 0) + 1

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">Results</span>
          <h1>Scores</h1>
          <p className="small muted">Live view of what judges have entered. Verifying, editing, paper scores and releasing results arrive in week 3.</p>
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
      <div className="grid-4">
        <div className="stat"><b>{rows.length}</b><span>Teams in heats</span></div>
        <div className="stat"><b style={{ color: 'var(--warn)' }}>{counts.draft ?? 0}</b><span>Being scored</span></div>
        <div className="stat"><b style={{ color: 'var(--gold-hi)' }}>{counts.submitted ?? 0}</b><span>Awaiting check</span></div>
        <div className="stat"><b style={{ color: 'var(--ok)' }}>{counts.verified ?? 0}</b><span>Verified</span></div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">No heats for this workout yet. <Link href={`/admin/heats?workout=${workout.id}`}>Set up heats</Link></div>
      ) : (
        (parts ?? []).map((p: WorkoutPart & { id: string }) => (
          <section key={p.id} className="stack-sm">
            {(parts?.length ?? 0) > 1 && <h2>Part {p.label}{p.name ? ` · ${p.name}` : ''}{!p.scored && <span className="small subtle"> (buy-in)</span>}</h2>}
            <div className="card table-wrap" style={{ padding: 0 }}>
              <table className="table">
                <thead><tr><th>Heat</th><th>Lane</th><th>Team</th><th>Division</th><th>Judge</th><th>Score</th><th>Detail</th><th>Agreed by</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((l) => {
                    const s = (scores ?? []).find((x) => x.part_id === p.id && x.team_id === l.team!.id)
                    const r = s && s.entries?.kind ? computeScore(p, l.team!.division.sex, s.entries as Entries) : null
                    return (
                      <tr key={l.id}>
                        <td className="mono">{l.heat.number}</td>
                        <td className="mono">{l.lane}</td>
                        <td style={{ fontWeight: 600 }}>{l.team!.name}</td>
                        <td className="small">{l.team!.division.name}</td>
                        <td className="small muted">{l.judge?.name ?? '—'}</td>
                        <td className="mono" style={{ fontWeight: 600 }}>{r?.display ?? '—'}</td>
                        <td className="small muted">{r?.detail.join(' · ') || ''}</td>
                        <td className="small muted">{s?.signed_by ?? ''}</td>
                        <td>{s ? <span className={`pill ${STATUS[s.status]}`}>{LABEL[s.status]}</span> : <span className="pill pill-dim">Not started</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </>
  )
}
