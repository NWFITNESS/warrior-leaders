import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { getSchedule } from '@/lib/public-data'

export const revalidate = 60
export const metadata = { title: 'Heats' }

export default async function SchedulePage() {
  const heats = await getSchedule()
  const workouts = [...new Map(heats.map((h) => [h.workout_id, { id: h.workout_id, number: h.workout_number, name: h.workout_name }])).values()]

  return (
    <main className="public">
      <PublicNav current="/schedule" />
      <header className="stack-sm"><span className="eyebrow">Schedule</span><h1>Heats</h1></header>
      {workouts.length === 0 && <div className="empty">Heat times will be published before the day.</div>}
      {workouts.map((w) => (
        <section key={w.id} className="stack-sm">
          <h2>Event {w.number} · {w.name}</h2>
          {heats.filter((h) => h.workout_id === w.id).map((h) => (
            <div key={h.heat_id} className="card stack-sm" style={{ padding: '12px 16px' }}>
              <div className="spread" style={{ alignItems: 'baseline' }}>
                <b style={{ fontSize: '1.1rem' }}>Heat {h.heat_number}</b>
                <span className="mono" style={{ color: 'var(--gold-hi)', fontWeight: 700 }}>{h.start_time ? h.start_time.slice(0, 5) : 'TBC'}</span>
              </div>
              <div className="stack-sm" style={{ gap: 4 }}>
                {h.lanes.map((l) => (
                  <div key={l.lane} className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'baseline' }}>
                    {/* fixed lane label; long team names wrap inside their own column */}
                    <span className="mono subtle" style={{ flex: '0 0 auto', whiteSpace: 'nowrap', minWidth: 58 }}>Lane {l.lane}</span>
                    <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <Link href={`/teams/${l.team_id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{l.team_name}</Link>
                      <span className="small subtle" style={{ whiteSpace: 'nowrap' }}> · {l.division}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  )
}
