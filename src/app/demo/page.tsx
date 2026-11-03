import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { LeaderboardTabs } from '@/components/LeaderboardTabs'
import { demoBoard } from '@/lib/demo-board'
import { computeBoards } from '@/lib/public-data'
import { lowerTotalWins } from '@/lib/points'
import { scoringSummary } from '@/lib/types'

// Demo leaderboard with made-up teams and results (nothing real, nothing in the database).
export const metadata = { title: 'Demo leaderboard', robots: { index: false, follow: false } }

export default function DemoPage() {
  const board = demoBoard()
  const boards = computeBoards(board)
  return (
    <main className="public" style={{ maxWidth: 980 }}>
      <PublicNav current="/" />
      <div className="demo-banner">Demo: made-up teams and results to show how the leaderboard will look. Not real scores.</div>
      <header className="stack-sm" style={{ textAlign: 'center', justifyItems: 'center' }}>
        <h1 className="wordmark" style={{ fontSize: 'clamp(2rem, 7vw, 3rem)' }}>Warrior <b>Leaders</b></h1>
        <p className="muted">Saturday, 7 November 2026 · Northern Warrior</p>
      </header>
      <LeaderboardTabs boards={boards} lowerWins={lowerTotalWins(board.settings.points_method)} linkTeams={false} />
      <section className="stack-sm">
        <h2>Events</h2>
        <div className="ev-cards">
          {board.workouts.map((w) => (
            <Link key={w.id} href={`/demo/workouts/${w.number}`} className="ev-card">
              <span className="ev-no">Event {w.number}{w.open_entry ? ' · side event' : ''}</span>
              <b>{w.name}</b>
              {w.parts.map((p) => <span key={p.id} className="ev-line">{w.parts.length > 1 ? <em>{p.label}: </em> : null}{scoringSummary(p)}</span>)}
              <span className="ev-go">Breakdown &amp; results →</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
