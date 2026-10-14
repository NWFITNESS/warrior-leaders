import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { formatCap, partTitle, partTitleOr, scoreTypeLabel, type Workout } from '@/lib/types'
import { createWorkout } from './actions'

export const metadata = { title: 'Workouts' }

const STATUS: Record<Workout['status'], string> = { draft: 'pill-dim', ready: 'pill-ok', live: 'pill-warn', complete: 'pill-gold' }

export default async function WorkoutsPage() {
  const { supabase } = await requireStaff()
  const { data: workouts } = await supabase
    .from('wl_workouts')
    .select('*, workout_parts:wl_workout_parts(*, part_movements:wl_part_movements(id))')
    .order('number')
    .returns<Workout[]>()

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">{workouts?.length ?? 0} workouts</span>
          <h1>Workouts</h1>
        </div>
        <form action={createWorkout}><button className="btn">New workout</button></form>
      </div>

      {(workouts?.length ?? 0) === 0 ? (
        <div className="empty">No workouts yet. Create one, then add its parts, movements and standards.</div>
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr><th>#</th><th>Workout</th><th>Parts</th><th>Score type</th><th>Winner</th><th>Cap</th><th>Leaderboard</th><th>Status</th></tr>
            </thead>
            <tbody>
              {workouts!.map((w) => {
                const parts = [...(w.workout_parts ?? [])].sort((a, b) => a.sort_order - b.sort_order)
                const scored = parts.filter((p) => p.scored).length
                return (
                  <tr key={w.id}>
                    <td className="mono">{w.number}</td>
                    <td><Link href={`/admin/workouts/${w.id}`} style={{ fontWeight: 600 }}>{w.name}</Link></td>
                    <td className="small">{parts.map((p, i) => <div key={p.id}>{parts.length > 1 ? partTitleOr(p, i) : (partTitle(p) ?? '—')}{!p.scored && <span className="subtle"> (buy-in)</span>}</div>)}</td>
                    <td className="small">{parts.map((p) => <div key={p.id}>{scoreTypeLabel(p.score_type)}</div>)}</td>
                    <td className="small">{parts.map((p) => <div key={p.id}>{p.direction === 'asc' ? 'Lowest' : 'Highest'}</div>)}</td>
                    <td className="small mono">{parts.map((p) => <div key={p.id}>{p.rounds > 1 ? `${p.rounds} × ` : ''}{formatCap(p.time_cap_seconds)}</div>)}</td>
                    <td className="small">{w.combine_parts && scored > 1 ? '1 combined placing' : `${scored} placing${scored === 1 ? '' : 's'}`}</td>
                    <td><span className={`pill ${STATUS[w.status]}`}>{w.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
