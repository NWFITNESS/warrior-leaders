import { PublicNav } from '@/components/PublicNav'
import { getBoardData } from '@/lib/public-data'
import { formatCap, partTitle, scoreTypeLabel } from '@/lib/types'

export const revalidate = 60
export const metadata = { title: 'Workouts' }

export default async function WorkoutsPage() {
  const board = await getBoardData()
  const workouts = board?.workouts ?? []

  return (
    <main className="public">
      <PublicNav current="/workouts" />
      <header className="stack-sm"><span className="eyebrow">The Warrior Leaders</span><h1>Workouts</h1></header>
      {workouts.length === 0 && <div className="empty">Workouts will be announced soon.</div>}
      {workouts.map((w) => (
        <section key={w.id} className="card stack" style={{ gap: 14 }}>
          <h2>Event {w.number} · {w.name}</h2>
          {w.parts.sort((a, b) => a.sort_order - b.sort_order).map((p) => (
            <div key={p.id} className="stack-sm">
              {w.parts.length > 1 && (partTitle(p) || !p.scored) && <h3>{partTitle(p)}{!p.scored && <span className="small subtle"> (not scored)</span>}</h3>}
              <p className="muted small">
                {p.score_type === 'for_time' && p.rounds > 1
                  ? `${p.rounds} rounds, each in a ${formatCap(p.time_cap_seconds)} window. Each round is timed; your score is the total.`
                  : `${scoreTypeLabel(p.score_type)}${p.time_cap_seconds ? ` · ${p.score_type === 'for_time' ? 'cap' : 'time'} ${formatCap(p.time_cap_seconds)}` : ''}`}
                {' '}{p.direction === 'asc' ? 'Lowest wins.' : 'Highest wins.'}
                {p.tiebreak_note ? ` Tiebreak: ${p.tiebreak_note}.` : ''}
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Movement</th><th>Reps (M / F)</th><th>RX</th><th>Scaled</th></tr></thead>
                  <tbody>
                    {p.part_movements.map((m) => (
                      <tr key={m.id}>
                        <td><b>{m.name}</b>{m.standards && <div className="small muted" style={{ marginTop: 2 }}>{m.standards}</div>}</td>
                        <td className="mono">{m.reps ?? '—'}{m.reps_female != null && m.reps_female !== m.reps ? ` / ${m.reps_female}` : ''}</td>
                        <td>{m.rx_load ?? '—'}</td>
                        <td>{m.scaled_load ?? m.rx_load ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  )
}
