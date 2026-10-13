import Link from 'next/link'
import { getPublicSettings } from '@/lib/public-data'

export const revalidate = 60

export default async function Home() {
  const settings = await getPublicSettings()
  const date = settings ? new Date(settings.event_date + 'T09:00:00') : null

  return (
    <main className="public">
      <header className="stack-sm" style={{ paddingTop: 24 }}>
        <span className="eyebrow">{settings?.venue ?? 'Northern Warrior'}</span>
        <h1 style={{ fontSize: 'clamp(2.4rem, 9vw, 4rem)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          The Warrior <span style={{ color: 'var(--gold-hi)' }}>Leaders</span>
        </h1>
        {date && (
          <p className="muted">{date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        )}
      </header>

      <section className="card card-gold stack-sm">
        <h2>Leaderboard</h2>
        <p className="muted">The live leaderboard opens on competition day. Results appear here once each workout has been verified and released by the judges.</p>
      </section>

      <section className="card stack-sm">
        <h2>Teams</h2>
        <p className="muted">See every pair competing, by division.</p>
        <div><Link href="/teams" className="btn">View teams</Link></div>
      </section>
    </main>
  )
}
