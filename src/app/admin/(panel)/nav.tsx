'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS: { href: string; label: string; soon?: string }[] = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/teams', label: 'Teams & athletes' },
  { href: '/admin/workouts', label: 'Workouts' },
  { href: '/admin/judges', label: 'Judges' },
  { href: '/admin/heats', label: 'Heats & lanes' },
  { href: '/admin/scores', label: 'Scores' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '#', label: 'Leaderboard', soon: 'Wk 3' },
  { href: '#', label: 'Emails', soon: 'Wk 3' },
]

export function AdminNav() {
  const path = usePathname()
  return (
    <nav className="admin-nav">
      {ITEMS.map((item) => {
        if (item.soon) {
          return (
            <span key={item.label} style={{ display: 'block', padding: '8px 12px', fontSize: '0.9rem', color: 'var(--subtle)' }}>
              {item.label}<span className="soon">{item.soon}</span>
            </span>
          )
        }
        const active = item.href === '/admin' ? path === '/admin' : path.startsWith(item.href)
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
