'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { setCheckIn } from './actions'

export interface CheckInTeam {
  id: string; name: string; division: string; level: string; divisionOrder: number
  firstHeat: { time: string; event: number; heat: number; lane: number } | null
  athletes: { id: string; name: string; captain: boolean; checkedInAt: string | null }[]
}

type Filter = 'waiting' | 'all' | 'done'
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })

export function CheckIn({ teams: initial, competition }: { teams: CheckInTeam[]; competition: string }) {
  const router = useRouter()
  const [teams, setTeams] = useState(initial)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('waiting')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const search = useRef<HTMLInputElement>(null)

  // other tablets: pick up their check-ins every 15 s
  useEffect(() => { setTeams(initial) }, [initial])
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 15_000)
    return () => window.clearInterval(id)
  }, [router])

  const athletes = teams.flatMap((t) => t.athletes)
  const inCount = athletes.filter((a) => a.checkedInAt).length
  const teamDone = (t: CheckInTeam) => t.athletes.length > 0 && t.athletes.every((a) => a.checkedInAt)
  const teamsDone = teams.filter(teamDone).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teams
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.athletes.some((a) => a.name.toLowerCase().includes(q)))
      .filter((t) => q || filter === 'all' || (filter === 'done' ? teamDone(t) : !teamDone(t)))
      // earliest heat first, so the people who need to be ready soonest are at the top
      .sort((a, b) => (a.firstHeat?.time ?? '99').localeCompare(b.firstHeat?.time ?? '99') || a.name.localeCompare(b.name))
  }, [teams, query, filter])

  async function toggle(teamId: string, athleteId: string, on: boolean) {
    setBusy(athleteId); setError('')
    const res = await setCheckIn(athleteId, on)
    setBusy(null)
    if (res.error) { setError(`Couldn’t save: ${res.error}. Check the Wi-Fi and try again.`); return }
    setTeams((ts) => ts.map((t) => t.id !== teamId ? t : { ...t, athletes: t.athletes.map((a) => a.id === athleteId ? { ...a, checkedInAt: res.at ?? null } : a) }))
    if (on) {
      const team = teams.find((t) => t.id === teamId)
      const nowAll = team?.athletes.every((a) => a.id === athleteId || a.checkedInAt)
      if (nowAll && query) { setFlash(team!.name); setQuery(''); window.setTimeout(() => setFlash(null), 2500); search.current?.focus() }
    }
  }

  return (
    <main className="ci">
      <header className="ci-top">
        <div className="ci-brand"><Logo width={150} /><span>{competition}</span></div>
        <div className="ci-stats">
          <div><b>{teamsDone}</b><span>of {teams.length} teams</span></div>
          <div><b>{inCount}</b><span>of {athletes.length} athletes</span></div>
        </div>
      </header>

      <div className="ci-bar">
        <input ref={search} className="ci-search" placeholder="Search team or athlete name" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        {query && <button type="button" className="ci-clear" onClick={() => { setQuery(''); search.current?.focus() }}>Clear</button>}
      </div>
      {!query && (
        <div className="ci-filters" role="tablist">
          {([['waiting', `Not checked in (${teams.length - teamsDone})`], ['done', `Checked in (${teamsDone})`], ['all', 'All teams']] as [Filter, string][]).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      )}

      {flash && <div className="ci-flash">✓ {flash} checked in</div>}
      {error && <div className="ci-error">{error}</div>}

      <div className="ci-list">
        {shown.length === 0 && <p className="ci-empty">{query ? `No team or athlete matches “${query}”.` : filter === 'waiting' ? 'Everyone’s checked in. 🎉' : 'Nobody checked in yet.'}</p>}
        {shown.map((t) => {
          const done = teamDone(t)
          return (
            <section key={t.id} className={`ci-team${done ? ' done' : ''}`}>
              <div className="ci-team-head">
                <div>
                  <h2>{t.name}</h2>
                  <p><span className={`ci-div ${t.level === 'scaled' ? 'sc' : 'rx'}`}>{t.division}</span>
                    {t.firstHeat ? <> First heat <b>{t.firstHeat.time}</b> · Event {t.firstHeat.event} · Heat {t.firstHeat.heat} · Lane {t.firstHeat.lane}</> : ' No heat yet'}</p>
                </div>
                {done && <span className="ci-tick">✓ Team in</span>}
              </div>
              <div className="ci-athletes">
                {t.athletes.map((a) => (
                  <button key={a.id} type="button" className={`ci-ath${a.checkedInAt ? ' in' : ''}`} disabled={busy === a.id}
                    onClick={() => {
                      if (a.checkedInAt && !window.confirm(`Undo check-in for ${a.name}?`)) return
                      void toggle(t.id, a.id, !a.checkedInAt)
                    }}>
                    <span className="box">{a.checkedInAt ? '✓' : ''}</span>
                    <span className="nm"><b>{a.name}</b><small>{busy === a.id ? 'Saving…' : a.checkedInAt ? `Checked in ${time(a.checkedInAt)}` : `Tap to check in${a.captain ? ' · captain' : ''}`}</small></span>
                  </button>
                ))}
                {t.athletes.length === 0 && <p className="ci-empty">No athletes on this team.</p>}
              </div>
            </section>
          )
        })}
      </div>
      <footer className="ci-foot"><a href="/admin">‹ Admin</a><span>Updates from other tablets every 15 seconds</span></footer>
    </main>
  )
}
