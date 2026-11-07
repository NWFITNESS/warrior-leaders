'use client'

import { useEffect, useRef, useState } from 'react'
import type { HeatLane, JudgeHeat, JudgeWorkout } from '@/lib/judge-client'

const TAKE_ERRORS: Record<string, string> = {
  offline: 'No signal. Move closer to the Wi-Fi and try again.',
  finished: 'That lane has already been submitted.',
  not_open: 'That event isn’t open for judging yet.',
  empty_lane: 'There’s no team in that lane.',
}

const first = (name: string | null) => (name ?? '').split(' ')[0]

/**
 * Every heat of an event with its time and lanes.
 *  - Lane judges: tap a free lane to take it (someone else's → asked to take it over).
 *  - Head judges: the heat sheet — who's judging each lane and how far the scores have got; tap to open.
 */
export function HeatBoard({ heats, workouts, judgeId, head, onTake }: {
  heats: JudgeHeat[]; workouts: JudgeWorkout[]; judgeId: string; head: boolean
  onTake: (laneId: string, force: boolean) => Promise<{ laneId: string } | { error: string; judgeName?: string }>
}) {
  const events = workouts.filter((w) => !w.open_entry && heats.some((h) => h.workout_id === w.id))
  const unfinished = events.find((w) => heats.some((h) => h.workout_id === w.id && h.lanes.some((l) => !l.done)))
  const [eventId, setEventId] = useState<string | null>(null)
  const ev = events.find((w) => w.id === eventId) ?? unfinished ?? events[0]
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const nextRef = useRef<HTMLDivElement>(null)

  const evHeats = ev ? heats.filter((h) => h.workout_id === ev.id).sort((a, b) => a.number - b.number) : []
  const nextHeat = evHeats.find((h) => h.lanes.some((l) => !l.done))

  // lane judges land on the heat that's up next
  useEffect(() => {
    if (!head && nextHeat && nextHeat.id !== evHeats[0]?.id) nextRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [head, ev?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (events.length === 0) {
    return (
      <div className="j-empty">
        <h2 className="j-h2">No heats yet</h2>
        <p className="j-note">Heats appear here once an event is ready and its heats are set.</p>
      </div>
    )
  }

  async function take(l: HeatLane) {
    setError('')
    const mine = l.judge_id === judgeId
    let force = false
    if (!head && !mine && l.judge_id) {
      if (!window.confirm(`${l.judge_name ?? 'Another judge'} is judging Lane ${l.lane}. Take it over?`)) return
      force = true
    }
    setBusy(l.lane_assignment_id)
    const res = await onTake(l.lane_assignment_id, force)
    setBusy(null)
    if ('error' in res) setError(TAKE_ERRORS[res.error] ?? 'Couldn’t open that lane. Ask the head judge.')
  }

  return (
    <div className="j-screen">
      {events.length > 1 && (
        <div className="j-chips" role="tablist" aria-label="Event">
          {events.map((w) => (
            <button key={w.id} type="button" role="tab" aria-pressed={w.id === ev?.id} onClick={() => { setEventId(w.id); setError('') }}>
              Event {w.number}
            </button>
          ))}
        </div>
      )}
      {ev && <h2 className="j-ev-title">Event {ev.number} · {ev.name}{ev.status === 'draft' && <span className="j-status warn"> · Draft</span>}</h2>}
      {error && <div className="j-banner bad">{error}</div>}

      {evHeats.map((h) => {
        const done = h.lanes.filter((l) => l.done).length
        const isNext = h.id === nextHeat?.id
        return (
          <section key={h.id} className="j-section" ref={isNext ? nextRef : undefined} style={{ scrollMarginTop: 64 }}>
            <div className="j-heat-head">
              <b>Heat {h.number}</b>
              {h.start_time && <span className="t">{h.start_time.slice(0, 5)}</span>}
              {isNext && <span className="j-status gold">Up next</span>}
              <span className="j-status" style={{ marginLeft: 'auto' }}>{done}/{h.lanes.length} submitted</span>
            </div>
            <div className="j-group">
              {h.lanes.length === 0 && <p className="j-note" style={{ padding: 16 }}>No teams in this heat yet.</p>}
              {h.lanes.map((l) => {
                const mine = l.judge_id === judgeId
                const locked = !head && l.done && !mine
                const status = head
                  ? (l.done ? ['Submitted', 'gold'] : l.started ? ['Scoring', 'warn'] : l.judge_id ? ['Ready', ''] : ['No judge', 'warn'])
                  : (mine ? ['You', 'ok'] : l.done ? ['Submitted', 'gold'] : l.judge_id ? [first(l.judge_name), ''] : ['Take', 'gold'])
                // head judges: colour each lane by state so who's on what reads at a glance
                const hj = head ? ` hj ${l.done ? 'done' : l.started ? 'scoring' : l.judge_id ? 'taken' : 'free'}` : ''
                return (
                  <button key={l.lane_assignment_id} type="button" className={`j-lane${mine && !head ? ' next' : ''}${hj}`} disabled={locked || !!busy}
                    onClick={() => take(l)}>
                    <span className="no">{l.lane}</span>
                    <span className="main">
                      <b>{l.team_name}</b>
                      <small>{l.division}</small>
                      {head && <span className="hj-judge">{l.judge_id ? `👤 ${l.judge_name ?? 'Judge'}` : 'No judge yet'}</span>}
                    </span>
                    <span className={`j-status ${status[1]}`}>{busy === l.lane_assignment_id ? 'Opening…' : status[0]}</span>
                    {!locked && <span className="chev" aria-hidden>›</span>}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
