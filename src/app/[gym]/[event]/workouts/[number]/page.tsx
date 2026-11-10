import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicNav } from '@/components/PublicNav'
import { Standards } from '@/components/Standards'
import { WorkoutBreakdown } from '@/components/WorkoutBreakdown'
import { eventResults, getBoardData, revealTime } from '@/lib/public-data'
import { EventResults } from './event-results'
import { eventFromParams } from '@/lib/public-event'

type Params = Promise<{ gym: string; event: string; number: string }>

export const revalidate = 30

export async function generateMetadata({ params }: { params: Params }) {
  const { number } = await params
  return { title: `Event ${number}` }
}

export default async function EventPage({ params }: { params: Params }) {
  const { number } = await params
  const { event, base } = await eventFromParams(params)
  const board = await getBoardData(event.id)
  const workout = board?.workouts.find((w) => String(w.number) === number)
  const upcoming = board?.upcoming?.find((u) => String(u.number) === number)
  if (board && !workout && upcoming) {
    return (
      <main className="public">
        <PublicNav base={base} current="/workouts" />
        <header className="stack-sm">
          <Link href={`${base}/workouts`} className="small">← All workouts</Link>
          <span className="eyebrow">Event {upcoming.number}</span>
          <h1>To be revealed</h1>
        </header>
        <div className="empty">Event {upcoming.number} goes live at <b>{revealTime(upcoming.public_from)}</b>. Check back then for the workout, standards and results.</div>
      </main>
    )
  }
  if (!board || !workout) notFound()
  const results = eventResults(board, workout.id)
  const others = board.workouts.filter((w) => w.id !== workout.id)

  return (
    <main className="public">
      <PublicNav base={base} current="/workouts" />
      <header className="stack-sm">
        <Link href={`${base}/workouts`} className="small">← All workouts</Link>
        <span className="eyebrow">Event {workout.number}{workout.open_entry ? ' · side event' : ''}</span>
        <h1>{workout.name}</h1>
      </header>

      <section className="card stack" style={{ gap: 14 }}>
        <h2>The workout</h2>
        <WorkoutBreakdown parts={workout.parts} />
      </section>

      {workout.description?.trim() && (
        <section className="card stack-sm">
          <h2>Event details</h2>
          <Standards text={workout.description} className="muted small" />
        </section>
      )}

      <section className="stack" style={{ gap: 12 }}>
        <h2>Results</h2>
        <EventResults results={results} base={base} />
      </section>

      {others.length > 0 && (
        <nav className="row small" aria-label="Other events">
          {others.map((w) => <Link key={w.id} href={`${base}/workouts/${w.number}`}>Event {w.number} · {w.name}</Link>)}
        </nav>
      )}
    </main>
  )
}
