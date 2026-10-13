import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AutoRefresh } from '@/components/AutoRefresh'
import { PublicNav } from '@/components/PublicNav'
import { computeBoards, getBoardData, getSchedule } from '@/lib/public-data'
import { buildEvents } from '@/lib/ranking'
import { MyTeamButton } from './my-team'

export const revalidate = 15

const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const board = await getBoardData()
  return { title: board?.teams.find((t) => t.id === id)?.name ?? 'Team' }
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [board, schedule] = await Promise.all([getBoardData(), getSchedule()])
  const team = board?.teams.find((t) => t.id === id)
  if (!board || !team) notFound()

  const division = board.divisions.find((d) => d.id === team.division_id)!
  const divBoard = computeBoards(board).find((b) => b.division.id === division.id)!
  const row = divBoard.rows.find((r) => r.teamId === id)!
  const released = new Set(divBoard.events.map((e) => e.key))
  const allEvents = buildEvents(board.workouts)
  const heats = schedule.flatMap((h) => h.lanes.filter((l) => l.team_id === id).map((l) => ({ ...h, lane: l.lane })))

  return (
    <main className="public">
      <AutoRefresh seconds={30} />
      <PublicNav current="/teams" />
      <header className="stack-sm">
        <span className="eyebrow">{division.name}</span>
        <h1 style={{ textTransform: 'none', fontSize: '2.2rem' }}>{team.name}</h1>
        <p className="muted">{team.athletes.map((a) => `${a.first_name} ${a.last_name}`.trim()).join(' & ')}</p>
        <MyTeamButton teamId={id} />
      </header>

      <section className="card card-gold" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', gap: 12 }}>
        <div><div className="eyebrow">Overall</div><div style={{ fontSize: '2.4rem', fontWeight: 800 }}>{divBoard.events.length ? ordinal(row.rank) : '—'}</div></div>
        <div><div className="eyebrow">Points</div><div style={{ fontSize: '2.4rem', fontWeight: 800 }}>{divBoard.events.length ? row.total : '—'}</div></div>
        <div><div className="eyebrow">Released</div><div style={{ fontSize: '2.4rem', fontWeight: 800 }}>{divBoard.events.length}/{allEvents.length}</div></div>
      </section>

      <section className="stack-sm">
        <h2>Scores</h2>
        {allEvents.length === 0 ? <p className="subtle">Workouts will be announced soon.</p> : (
          <div className="card" style={{ padding: '4px 16px' }}>
            {allEvents.map((e, i) => {
              const r = row.results[e.key]
              return (
                <div key={e.key} className="spread" style={{ padding: '12px 0', borderTop: i ? '1px solid var(--line)' : 0, alignItems: 'center' }}>
                  <div><b>Event {e.label}</b> <span className="muted">· {e.title}</span></div>
                  {released.has(e.key) && r ? (
                    <div style={{ textAlign: 'right' }}>
                      <b className="mono">{r.display}</b>
                      <div className="small subtle">{r.scored ? `${ordinal(r.place!)} · ${r.points} pts` : `No score · ${r.points} pts`}</div>
                    </div>
                  ) : <span className="pill pill-dim">Not released yet</span>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="stack-sm">
        <h2>Your heats</h2>
        {heats.length === 0 ? <p className="subtle">Heat times will be published before the day.</p> : (
          <div className="card" style={{ padding: '4px 16px' }}>
            {heats.map((h, i) => (
              <div key={h.heat_id} className="spread" style={{ padding: '12px 0', borderTop: i ? '1px solid var(--line)' : 0, alignItems: 'center' }}>
                <div><b>Event {h.workout_number}</b> <span className="muted">· {h.workout_name}</span></div>
                <div style={{ textAlign: 'right' }}>
                  <b>{h.start_time ? h.start_time.slice(0, 5) : 'Time TBC'}</b>
                  <div className="small subtle">Heat {h.heat_number} · Lane {h.lane}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <Link href="/" className="small">← Back to the leaderboard</Link>
    </main>
  )
}
