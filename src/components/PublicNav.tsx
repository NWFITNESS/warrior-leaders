import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from './Logo'

// Simple line icons (24px, stroke = currentColor) for the phone tab bar.
const I = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
)
const ICONS: Record<string, ReactNode> = {
  '': <I><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></I>,
  '/schedule': <I><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>,
  '/workouts': <I><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></I>,
  '/teams': <I><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2c2.9.4 5 2.8 5 5.8" /></I>,
  '/live': <I><circle cx="12" cy="12" r="2" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></I>,
}

const LINKS = [
  { href: '', label: 'Leaderboard', short: 'Leaders' },
  { href: '/schedule', label: 'Heats', short: 'Heats' },
  { href: '/workouts', label: 'Workouts', short: 'Workouts' },
  { href: '/teams', label: 'Teams', short: 'Teams' },
  { href: '/live', label: 'Live', short: 'Live' },
]

/** `base`: the event's address (/{gym}/{event}); links are relative to it. `current`: '' for the leaderboard, '/schedule'… */
export function PublicNav({ current, base = '' }: { current: string; base?: string }) {
  const here = current === '/' ? '' : current
  const to = (href: string) => base + href || '/'
  return (
    <>
      <header className="pub-nav">
        <Link href={to('')} aria-label="Leaderboard" className="pub-logo"><Logo width={190} /></Link>
        <nav aria-label="Main" className="pub-links">
          {LINKS.map((l) => <Link key={l.href} href={to(l.href)} aria-current={l.href === here ? 'page' : undefined}>{l.label}</Link>)}
        </nav>
        <Link href={to('/live')} className="pub-live-pill"><i aria-hidden />Live</Link>
      </header>
      {/* phones: app-style tab bar along the bottom */}
      <nav aria-label="Main" className="pub-tabbar">
        {LINKS.map((l) => (
          <Link key={l.href} href={to(l.href)} aria-current={l.href === here ? 'page' : undefined}>
            {ICONS[l.href]}<span>{l.short}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
