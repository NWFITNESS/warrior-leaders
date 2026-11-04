'use client'

import { useState, type ReactNode } from 'react'
import { getDraft, type Lane, type OpenEvent } from '@/lib/judge-client'

export function laneStatus(lane: Lane): { label: string; className: string; done: boolean } {
  const scored = lane.parts.filter((p) => p.scored || lane.parts.length === 1)
  const statuses = scored.map((p) => {
    const server = lane.scores.find((s) => s.part_id === p.id)?.status
    const local = getDraft(lane.lane_assignment_id, p.id)
    if (server === 'verified') return 'verified'
    if (server === 'submitted' || server === 'appeal' || local?.status === 'submitted') return 'submitted'
    if (server === 'draft' || local) return 'progress'
    return 'none'
  })
  if (statuses.every((s) => s === 'verified')) return { label: 'Verified', className: 'pill-ok', done: true }
  if (statuses.every((s) => s === 'submitted' || s === 'verified')) return { label: 'Submitted', className: 'pill-gold', done: true }
  if (statuses.some((s) => s !== 'none')) return { label: 'In progress', className: 'pill-warn', done: false }
  return { label: 'Not started', className: 'pill-dim', done: false }
}

const SIDE_STATUS: Record<string, [string, string]> = {
  draft: ['In progress', 'warn'], submitted: ['Submitted', 'gold'], verified: ['Verified', 'ok'], appeal: ['Appeal', 'warn'], rejected: ['Rejected', 'warn'],
}

export function LaneList({ lanes: allLanes, openEvents = [], onOpen, onRefresh, onScoreTeam, sideError, showJudge = false, title, children }: {
  lanes: Lane[]; openEvents?: OpenEvent[]; onOpen: (id: string) => void; onRefresh: () => void
  onScoreTeam?: (workoutId: string, teamId: string) => Promise<boolean>; sideError?: string; showJudge?: boolean
  title?: string // heading over the judge's own lanes
  children?: ReactNode // shown under the lanes (hidden while picking a side-event team)
}) {
  const [picking, setPicking] = useState<string | null>(null) // workout id
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const lanes = allLanes.filter((l) => !l.workout.open_entry) // side-event lanes live in their own section

  const side = openEvents.length > 0 && (
    <div className="j-screen">
      {openEvents.map((ev) => {
        if (picking === ev.workout.id) {
          const q = query.trim().toLowerCase()
          const teams = ev.teams.filter((t) => !q || t.name.toLowerCase().includes(q))
          const divisions = [...new Set(teams.map((t) => t.division))]
          return (
            <section key={ev.workout.id} className="j-section">
              <div className="j-pick-head">
                <h2 className="j-h2">Event {ev.workout.number} · {ev.workout.name} · pick the team</h2>
                <button type="button" className="j-tool" onClick={() => { setPicking(null); setQuery('') }}>Cancel</button>
              </div>
              <input className="j-search" placeholder="Search teams" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
              {sideError && <div className="j-banner bad">{sideError}</div>}
              {divisions.map((d) => (
                <div key={d} className="j-section">
                  <h2 className="j-h2">{d}</h2>
                  <div className="j-group">
                    {teams.filter((t) => t.division === d).map((t) => {
                      const st = t.status ? SIDE_STATUS[t.status] : null
                      return (
                        <button key={t.id} type="button" className="j-name" disabled={!!busy}
                          onClick={async () => { setBusy(t.id); const ok = await onScoreTeam?.(ev.workout.id, t.id); setBusy(null); if (ok) { setPicking(null); setQuery('') } }}>
                          <span>{t.name}</span>
                          {busy === t.id ? <small>Opening…</small> : st && <span className={`j-status ${st[1]}`}>{st[0]}</span>}
                          <span className="chev" aria-hidden>›</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {teams.length === 0 && <p className="j-note">No team matches “{query}”.</p>}
            </section>
          )
        }
        const mine = allLanes.filter((l) => l.workout.id === ev.workout.id)
        const done = ev.teams.filter((t) => t.status && t.status !== 'draft').length
        return (
          <section key={ev.workout.id} className="j-section">
            <h2 className="j-h2">Side event · Event {ev.workout.number} · {ev.workout.name}</h2>
            <div className="j-group">
              <button type="button" className="j-lane next" onClick={() => setPicking(ev.workout.id)}>
                <span className="no">+</span>
                <span className="main"><b>Score a team</b><small>Any team, whenever they’re ready · {done} of {ev.teams.length} done</small></span>
                <span className="chev" aria-hidden>›</span>
              </button>
              {mine.map((l) => {
                const st = laneStatus(l)
                return (
                  <button key={l.lane_assignment_id} type="button" className="j-lane" onClick={() => onOpen(l.lane_assignment_id)}>
                    <span className="no">✓</span>
                    <span className="main"><b>{l.team.name}</b><small>{l.team.division}{showJudge && l.judge_name ? ` · ${l.judge_name}` : ''}</small></span>
                    <span className={`j-status ${st.className.replace('pill-', '')}`}>{st.label}</span>
                    <span className="chev" aria-hidden>›</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
  if (picking) return <>{side}</>

  if (lanes.length === 0) {
    if (side || children) return <div className="j-screen">{side}{children}</div>
    return (
      <div className="j-empty">
        <h2 className="j-h2">No lanes yet</h2>
        <p className="j-note">You haven’t been given a lane for a workout that’s ready. The head judge sets this up in the admin.</p>
        <button type="button" className="j-tool" onClick={onRefresh}>Check again</button>
      </div>
    )
  }

  const nextId = lanes.find((l) => !laneStatus(l).done)?.lane_assignment_id
  const workouts = [...new Map(lanes.map((l) => [l.workout.id, l.workout])).values()]

  return (
    <div className="j-screen">
      {side}
      {workouts.map((w) => (
        <section key={w.id} className="j-section">
          <h2 className="j-h2">{title ? `${title} · ` : ''}Event {w.number} · {w.name}</h2>
          <div className="j-group">
            {lanes.filter((l) => l.workout.id === w.id).map((l) => {
              const st = laneStatus(l)
              const next = l.lane_assignment_id === nextId
              return (
                <button key={l.lane_assignment_id} type="button" className={`j-lane${next ? ' next' : ''}`} onClick={() => onOpen(l.lane_assignment_id)}>
                  <span className="no">{l.lane}</span>
                  <span className="main">
                    <b>{l.team.name}</b>
                    <small>Heat {l.heat_number}{l.start_time ? ` · ${l.start_time.slice(0, 5)}` : ''} · {l.team.division}{showJudge && l.judge_name ? ` · ${l.judge_name}` : ''}</small>
                  </span>
                  {(next && !st.done) || st.label !== 'Not started' ? <span className={`j-status ${next && st.label === 'Not started' ? 'gold' : st.className.replace('pill-', '')}`}>{next && st.label === 'Not started' ? 'Next up' : st.label}</span> : null}
                  <span className="chev" aria-hidden>›</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {children}
    </div>
  )
}
