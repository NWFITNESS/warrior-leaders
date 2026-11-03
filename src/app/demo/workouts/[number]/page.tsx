import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicNav } from '@/components/PublicNav'
import { Standards } from '@/components/Standards'
import { WorkoutBreakdown } from '@/components/WorkoutBreakdown'
import { EventResults } from '@/app/workouts/[number]/event-results'
import { demoBoard } from '@/lib/demo-board'
import { eventResults } from '@/lib/public-data'

export const metadata = { title: 'Demo event', robots: { index: false, follow: false } }

export default async function DemoEventPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params
  const board = demoBoard()
  const workout = board.workouts.find((w) => String(w.number) === number)
  if (!workout) notFound()
  return (
    <main className="public">
      <PublicNav current="/workouts" />
      <div className="demo-banner">Demo: made-up teams and results. Not real scores.</div>
      <header className="stack-sm">
        <Link href="/demo" className="small">← Demo leaderboard</Link>
        <span className="eyebrow">Event {workout.number}{workout.open_entry ? ' · side event' : ''}</span>
        <h1>{workout.name}</h1>
      </header>
      <section className="card stack" style={{ gap: 14 }}>
        <h2>The workout</h2>
        <WorkoutBreakdown parts={workout.parts} />
      </section>
      {workout.description && (
        <section className="card stack-sm"><h2>Event details</h2><Standards text={workout.description} className="muted small" /></section>
      )}
      <section className="stack" style={{ gap: 12 }}>
        <h2>Results</h2>
        <EventResults results={eventResults(board, workout.id)} linkTeams={false} />
      </section>
      <nav className="row small" aria-label="Other events">
        {board.workouts.filter((w) => w.id !== workout.id).map((w) => <Link key={w.id} href={`/demo/workouts/${w.number}`}>Event {w.number} · {w.name}</Link>)}
      </nav>
    </main>
  )
}
