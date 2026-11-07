'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

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
const ALL = GROUPS.flatMap((g) => g.items)
const isActive = (href: string, path: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href))

export function AdminNav() {
  const path = usePathname()
  return (
    <nav className="admin-nav">
      {GROUPS.map((g) => (
        <div key={g.title} style={{ display: 'contents' }}>
          <span className="grp">{g.title}</span>
          {g.items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(item.href, path) ? 'page' : undefined}>{item.label}</Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

// ── Phones: top app bar + bottom tab bar + "More" sheet ─────────────────────────
const I = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
)
const TABS: { href: string; label: string; icon: ReactNode }[] = [
  { href: '/admin', label: 'Overview', icon: <I><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8Z" /></I> },
  { href: '/admin/scores', label: 'Scores', icon: <I><path d="M9 4h6v3H9zM7 5.5H5.5A1.5 1.5 0 0 0 4 7v12.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H17" /><path d="m8.5 14 2.5 2.5 4.5-5" /></I> },
  { href: '/admin/heats', label: 'Heats', icon: <I><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I> },
  { href: '/admin/leaderboard', label: 'Leaders', icon: <I><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></I> },
]

export function AdminMobileBar({ children }: { children?: ReactNode }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [path])
  useEffect(() => {
    document.documentElement.classList.toggle('sheet-open', open)
    return () => document.documentElement.classList.remove('sheet-open')
  }, [open])
  const title = [...ALL].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(i.href, path))?.label ?? 'Admin'
  const inTabs = TABS.some((t) => isActive(t.href, path))

  return (
    <>
      <header className="am-top">
        <Link href="/admin" className="am-mark" aria-label="Admin home"><img src="/brand/mark.svg" alt="" width={34} height={22} /></Link>
        <b>{title}</b>
        <button type="button" className="am-menu" aria-label="All pages" onClick={() => setOpen(true)}>
          <I><path d="M4 7h16M4 12h16M4 17h16" /></I>
        </button>
      </header>

      <nav className="am-tabs" aria-label="Admin">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={isActive(t.href, path) ? 'page' : undefined}>{t.icon}<span>{t.label}</span></Link>
        ))}
        <button type="button" aria-current={!inTabs || open ? 'page' : undefined} onClick={() => setOpen(true)}>
          <I><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></I><span>More</span>
        </button>
      </nav>

      {open && (
        <div className="am-sheet-wrap" onClick={() => setOpen(false)}>
          <div className="am-sheet" role="dialog" aria-label="All admin pages" onClick={(e) => e.stopPropagation()}>
            <span className="am-grab" aria-hidden />
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                <div className="am-list">
                  {g.items.map((item) => (
                    <Link key={item.href} href={item.href} aria-current={isActive(item.href, path) ? 'page' : undefined}>
                      {item.label}<i aria-hidden>›</i>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
            <div className="am-foot">{children}</div>
          </div>
        </div>
      )}
    </>
  )
}
