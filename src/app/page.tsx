import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { getPublicSettings } from '@/lib/public-data'

export const revalidate = 60

export default async function Home() {
  const settings = await getPublicSettings()
  const date = settings ? new Date(settings.event_date + 'T09:00:00') : null

  return (
    <main className="public">
      <header className="stack" style={{ justifyItems: 'center', textAlign: 'center', paddingTop: 16 }}>
        <Logo width={420} />
        <div className="stack-sm" style={{ justifyItems: 'center' }}>
          <h1 className="wordmark" style={{ fontSize: 'clamp(2rem, 8vw, 3.2rem)' }}>
            The Warrior <b>Leaders</b>
          </h1>
          {date && (
            <p className="muted" style={{ fontSize: '1.1rem' }}>
              {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {settings?.venue ? ` · ${settings.venue}` : ''}
            </p>
          )}
        </div>
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
