'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const GROUPS: { title: string; items: { href: string; label: string }[] }[] = [
  { title: 'Event', items: [{ href: '/admin', label: 'Overview' }] },
  { title: 'Set up', items: [
    { href: '/admin/teams', label: 'Teams & athletes' },
    { href: '/admin/workouts', label: 'Workouts' },
    { href: '/admin/judges', label: 'Judges' },
    { href: '/admin/heats', label: 'Heats & lanes' },
  ] },
  { title: 'On the day', items: [
    { href: '/admin/check-in', label: 'Check-in (tablet)' },
    { href: '/admin/scores', label: 'Scores' },
    { href: '/admin/leaderboard', label: 'Leaderboard' },
    { href: '/admin/final', label: 'Final heats' },
    { href: '/admin/big-screen', label: 'Big screen (TV)' },
    { href: '/admin/emails', label: 'Emails' },
  ] },
  { title: 'System', items: [
    { href: '/admin/audit', label: 'Audit log' },
    { href: '/admin/settings', label: 'Settings' },
  ] },
]

export function AdminNav() {
  const path = usePathname()
  return (
    <nav className="admin-nav">
      {GROUPS.map((g) => (
        <div key={g.title} style={{ display: 'contents' }}>
          <span className="grp">{g.title}</span>
          {g.items.map((item) => {
            const active = item.href === '/admin' ? path === '/admin' : path.startsWith(item.href)
            return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>{item.label}</Link>
          })}
        </div>
      ))}
    </nav>
  )
}
