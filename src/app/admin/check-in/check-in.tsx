'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setTeamCheckIn } from './actions'

export interface CheckInTeam {
  id: string; name: string; division: string; level: string; divisionOrder: number
  firstHeat: { time: string; event: number; heat: number; lane: number } | null
  athletes: { id: string; name: string; captain: boolean; checkedInAt: string | null }[]
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
const checkedAt = (t: CheckInTeam) => (t.athletes.length > 0 && t.athletes.every((a) => a.checkedInAt) ? t.athletes[0].checkedInAt : null)

/** Morning registration on a tablet: one row per team, tap to check the team in. */
export function CheckIn({ teams: initial, competition }: { teams: CheckInTeam[]; competition: string }) {
  const router = useRouter()
  const [teams, setTeams] = useState(initial)
  const [query, setQuery] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const search = useRef<HTMLInputElement>(null)

  // other tablets: pick up their check-ins every 15 s
  useEffect(() => { setTeams(initial) }, [initial])
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 15_000)
    return () => window.clearInterval(id)
  }, [router])

  const done = teams.filter((t) => checkedAt(t)).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teams
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.athletes.some((a) => a.name.toLowerCase().includes(q)))
      .filter((t) => q || !hideDone || !checkedAt(t))
      // earliest heat first: the teams who need to be ready soonest are at the top
      .sort((a, b) => (a.firstHeat?.time ?? '99').localeCompare(b.firstHeat?.time ?? '99') || a.name.localeCompare(b.name))
  }, [teams, query, hideDone])

  async function toggle(t: CheckInTeam) {
    const on = !checkedAt(t)
    if (!on && !window.confirm(`Undo check-in for ${t.name}?`)) return
    setBusy(t.id); setError('')
    const res = await setTeamCheckIn(t.id, on)
    setBusy(null)
    if (res.error) { setError(`Couldn’t save: ${res.error}. Check the Wi-Fi and try again.`); return }
    setTeams((ts) => ts.map((x) => (x.id !== t.id ? x : { ...x, athletes: x.athletes.map((a) => ({ ...a, checkedInAt: res.at ?? null })) })))
    if (on && query) { setQuery(''); search.current?.focus() }
  }

  return (
    <main className="ci">
      <header className="ci-top">
        <div><h1>Check-in</h1><span>{competition}</span></div>
        <div className="ci-count"><b>{done}</b>/{teams.length} teams</div>
      </header>

      <div className="ci-bar">
        <input ref={search} className="ci-search" type="search" placeholder="Search team or athlete…" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        {query
          ? <button type="button" className="ci-btn" onClick={() => { setQuery(''); search.current?.focus() }}>Clear</button>
          : <button type="button" className="ci-btn" aria-pressed={hideDone} onClick={() => setHideDone((v) => !v)}>{hideDone ? 'Show all' : 'Hide checked in'}</button>}
      </div>
      {error && <div className="ci-error">{error}</div>}

      <ul className="ci-list">
        {shown.length === 0 && <li className="ci-empty">{query ? `Nothing matches “${query}”.` : 'Every team is checked in. 🎉'}</li>}
        {shown.map((t) => {
          const at = checkedAt(t)
          return (
            <li key={t.id}>
              <button type="button" className={`ci-row${at ? ' in' : ''}`} disabled={busy === t.id} onClick={() => void toggle(t)}>
                <span className="box">{at ? '✓' : ''}</span>
                <span className="nm">
                  <b>{t.name}</b>
                  <small>{t.athletes.map((a) => a.name).join(' & ') || 'No athletes'}</small>
                </span>
                <span className={`ci-div ${t.level === 'scaled' ? 'sc' : 'rx'}`}>{t.division}</span>
                <span className="ht">{busy === t.id ? 'Saving…' : at ? `In ${time(at)}` : t.firstHeat ? `${t.firstHeat.time} · E${t.firstHeat.event} H${t.firstHeat.heat} L${t.firstHeat.lane}` : ''}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <footer className="ci-foot"><a href="/admin">‹ Admin</a><span>Tap a team to check it in · updates from other tablets every 15 s</span></footer>
    </main>
  )
}
