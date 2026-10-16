import Link from 'next/link'
import { Logo } from './Logo'

const LINKS = [
  { href: '/', label: 'Leaderboard' },
  { href: '/schedule', label: 'Heats' },
  { href: '/workouts', label: 'Workouts' },
  { href: '/teams', label: 'Teams' },
  { href: '/live', label: 'Live' },
]

export function PublicNav({ current }: { current: string }) {
  return (
    <header className="pub-nav">
      <Link href="/" aria-label="The Warrior Leaders home"><Logo width={150} /></Link>
      <nav aria-label="Main">
        {LINKS.map((l) => <Link key={l.href} href={l.href} aria-current={l.href === current ? 'page' : undefined}>{l.label}</Link>)}
      </nav>
    </header>
  )
}
