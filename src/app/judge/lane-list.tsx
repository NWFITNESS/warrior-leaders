'use client'

import { getDraft, type Lane } from '@/lib/judge-client'

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

export function LaneList({ lanes, onOpen, onRefresh }: { lanes: Lane[]; onOpen: (id: string) => void; onRefresh: () => void }) {
  if (lanes.length === 0) {
    return (
      <div className="stack" style={{ paddingTop: 20, textAlign: 'center' }}>
        <h2>No lanes yet</h2>
        <p className="muted">You haven’t been given a lane for a workout that’s ready. The head judge sets this up in the admin.</p>
        <button className="btn btn-ghost" onClick={onRefresh}>Check again</button>
      </div>
    )
  }

  const nextId = lanes.find((l) => !laneStatus(l).done)?.lane_assignment_id
  const workouts = [...new Map(lanes.map((l) => [l.workout.id, l.workout])).values()]

  return (
    <div className="stack">
      {workouts.map((w) => (
        <section key={w.id} className="stack-sm">
          <h2>Event {w.number} · {w.name}</h2>
          {lanes.filter((l) => l.workout.id === w.id).map((l) => {
            const st = laneStatus(l)
            return (
              <button key={l.lane_assignment_id} type="button" className={`j-lane${l.lane_assignment_id === nextId ? ' next' : ''}`} onClick={() => onOpen(l.lane_assignment_id)}>
                <span className="ln"><small>LANE</small>{l.lane}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.team.name}</span>
                  <span className="small subtle">Heat {l.heat_number}{l.start_time ? ` · ${l.start_time.slice(0, 5)}` : ''} · {l.team.division}{l.judge_name ? ` · ${l.judge_name}` : ''}</span>
                </span>
                <span className={`pill ${st.className}`}>{l.lane_assignment_id === nextId && !st.done && st.label === 'Not started' ? 'Next up' : st.label}</span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}
