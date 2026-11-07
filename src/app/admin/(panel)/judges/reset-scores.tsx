'use client'

import { useState, useTransition } from 'react'
import { resetScores } from './actions'

export interface ResetEvent { id: string; number: number; name: string; scores: number; claimed: number }

export function ResetScores({ events }: { events: ResetEvent[] }) {
  const [workout, setWorkout] = useState<string>('all')
  const [freeLanes, setFreeLanes] = useState(true)
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [pending, start] = useTransition()

  const chosen = workout === 'all' ? events : events.filter((e) => e.id === workout)
  const scores = chosen.reduce((n, e) => n + e.scores, 0)
  const claimed = chosen.reduce((n, e) => n + e.claimed, 0)
  const label = workout === 'all' ? 'all events' : `Event ${chosen[0]?.number}`

  function run() {
    start(async () => {
      const res = await resetScores(workout === 'all' ? null : workout, freeLanes, confirm)
      setMsg(res)
      if (res.ok) setConfirm('')
    })
  }

  return (
    <section className="card stack reset-card">
      <div className="stack-sm">
        <h2>Clear practice scores</h2>
        <p className="muted small" style={{ maxWidth: '68ch' }}>
          For after a demo or practice run. Deletes the scores for the event you pick (the leaderboard and TV go back to zero for it)
          and, if ticked, frees the lanes judges have taken. Judges stay signed in. <b>Once heats start, only clear an event that hasn’t been run for real.</b>
        </p>
      </div>
      <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <label className="field" style={{ minWidth: 220 }}>
          <span>Which scores</span>
          <select className="input" value={workout} onChange={(e) => { setWorkout(e.target.value); setMsg({}) }}>
            <option value="all">All events ({events.reduce((n, e) => n + e.scores, 0)} scores)</option>
            {events.map((e) => <option key={e.id} value={e.id}>Event {e.number} · {e.name} ({e.scores} scores)</option>)}
          </select>
        </label>
        <label className="row small" style={{ gap: 8, paddingBottom: 10 }}>
          <input type="checkbox" checked={freeLanes} onChange={(e) => setFreeLanes(e.target.checked)} />
          Also free the lanes judges have taken ({claimed})
        </label>
      </div>
      <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <label className="field" style={{ width: 160 }}>
          <span>Type CLEAR to confirm</span>
          <input className="input mono" value={confirm} autoComplete="off" onChange={(e) => { setConfirm(e.target.value); setMsg({}) }} />
        </label>
        <button type="button" className="btn btn-danger" disabled={pending || confirm.trim().toUpperCase() !== 'CLEAR' || (scores === 0 && (!freeLanes || claimed === 0))} onClick={run}>
          {pending ? 'Clearing…' : `Clear ${scores} score${scores === 1 ? '' : 's'} · ${label}`}
        </button>
      </div>
      {msg.error && <p className="notice notice-bad">{msg.error}</p>}
      {msg.ok && <p className="notice notice-ok">{msg.ok}</p>}
    </section>
  )
}
