import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { getBoardData, revealTime } from '@/lib/public-data'
import { describeMovement, partTitle, scoringSummary } from '@/lib/types'

export const revalidate = 60
export const metadata = { title: 'Workouts' }

export default async function WorkoutsPage() {
  const board = await getBoardData()
  const workouts = board?.workouts ?? []

  return (
    <main className="public">
      <PublicNav current="/workouts" />
      <header className="stack-sm"><span className="eyebrow">Warrior Leaders</span><h1>Workouts</h1>
        <p className="muted small">Tap an event for the full breakdown, standards and results for each division.</p></header>
      {workouts.length === 0 && !board?.upcoming?.length && <div className="empty">Workouts will be announced soon.</div>}
      <div className="ev-cards">
        {workouts.map((w) => {
          const parts = [...w.parts].sort((a, b) => a.sort_order - b.sort_order)
          return (
            <Link key={w.id} href={`/workouts/${w.number}`} className="ev-card">
              <span className="ev-no">Event {w.number}{w.open_entry ? ' · side event' : ''}</span>
              <b>{w.name}</b>
              {parts.map((p) => (
                <span key={p.id} className="ev-line">
                  {parts.length > 1 && partTitle(p) ? <em>{partTitle(p)}: </em> : null}{scoringSummary(p)}
                </span>
              ))}
              <span className="ev-mv">{parts.flatMap((p) => p.part_movements.map((m) => describeMovement(m))).slice(0, 6).join(' · ')}</span>
              <span className="ev-go">Breakdown &amp; results →</span>
            </Link>
          )
        })}
        {(board?.upcoming ?? []).map((u) => (
          <div key={`u${u.number}`} className="ev-card locked">
            <span className="ev-no">Event {u.number}</span>
            <b>To be revealed</b>
            <span className="ev-line">Live at {revealTime(u.public_from)}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
