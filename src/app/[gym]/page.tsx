import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { getPublicGym } from '@/lib/public-data'
import { eventDates } from '@/lib/dates'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ gym: string }> }) {
  const { gym } = await params
  const g = await getPublicGym(gym)
  return { title: g ? `${g.name} · Events` : 'Events' }
}

const LABEL: Record<string, string> = { live: 'Live now', finished: 'Results', draft: 'Coming up' }

/** A gym's events, newest first. The gym's current event leads. */
export default async function GymPage({ params }: { params: Promise<{ gym: string }> }) {
  const { gym } = await params
  const g = await getPublicGym(gym)
  if (!g) notFound()
  const events = [...g.events].sort((a, b) => Number(b.slug === g.current) - Number(a.slug === g.current))

  return (
    <main className="public" style={{ maxWidth: 760 }}>
      <header className="stack-sm" style={{ textAlign: 'center', justifyItems: 'center', paddingTop: 24 }}>
        <Logo width={200} />
        <span className="eyebrow">{g.name}</span>
        <h1>Events</h1>
      </header>
      {events.length === 0 && <div className="empty">No events yet. Check back soon.</div>}
      <div className="ev-cards">
        {events.map((e) => (
          <Link key={e.slug} href={`/${g.slug}/${e.slug}`} className="ev-card">
            <span className="ev-no">{e.slug === g.current && e.status !== 'finished' ? 'On now' : LABEL[e.status] ?? ''}</span>
            <b>{e.name}</b>
            <span className="ev-line">{eventDates(e.start_date, e.end_date)}{e.venue ? ` · ${e.venue}` : ''}</span>
            <span className="ev-go">Leaderboard, heats &amp; workouts →</span>
          </Link>
        ))}
      </div>
    </main>
  )
}
