'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { db, useClock, useLive, usePromo } from '../live/live-screen'
import { clockText, countdown, heatTimeline, hhmm, type LiveHeat, type TimedHeat } from '@/lib/live'

type Cue =
  | { kind: 'final'; t: TimedHeat; left: number }
  | { kind: 'on'; t: TimedHeat; left: number }
  | { kind: 'go'; t: TimedHeat; in: number }
  | { kind: 'ready'; t: TimedHeat; in: number }
  | { kind: 'break'; t: TimedHeat; in: number }
  | { kind: 'done' }
  | { kind: 'none' }

const divisions = (h: LiveHeat) => [...new Set(h.lanes.map((l) => l.division))].join(' · ') || 'Lanes to be set'

/** Keep the iPad screen on. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const grab = () => nav.wakeLock?.request('screen').then((l) => { lock = l }, () => {})
    grab()
    const again = () => { if (document.visibilityState === 'visible') grab() }
    document.addEventListener('visibilitychange', again)
    return () => { document.removeEventListener('visibilitychange', again); lock?.release().catch(() => {}) }
  }, [])
}

/** When the judges actually started each heat (heat id → epoch ms), so the DJ clock runs live. */
function useHeatStarts(enabled: boolean) {
  const [starts, setStarts] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = async () => {
      const { data, error } = await db().rpc('wl_public_heat_starts')
      if (alive && !error && data) setStarts(data as Record<string, number>)
    }
    void load()
    const id = window.setInterval(load, 3000)
    return () => { alive = false; window.clearInterval(id) }
  }, [enabled])
  return starts
}

export function DjScreen({ at }: { at: string | null }) {
  useWakeLock()
  const { data, offline, offset } = useLive(null, null)
  const promo = usePromo()
  const now = useClock(offset, at)
  const starts = useHeatStarts(!at) // rehearsal (?at=) stays on the printed times
  const line = useMemo(() => (data ? heatTimeline(data.heats, now, starts) : []), [data, now, starts])

  const onNow = line.find((t) => t.state === 'now')
  const next = line.find((t) => t.state === 'next')
  const cue: Cue = onNow
    ? (onNow.end! - now <= 60 ? { kind: 'final', t: onNow, left: onNow.end! - now } : { kind: 'on', t: onNow, left: onNow.end! - now })
    : next && next.start != null
      ? (next.start - now <= 10 ? { kind: 'go', t: next, in: next.start - now } : next.start - now <= 120 ? { kind: 'ready', t: next, in: next.start - now } : { kind: 'break', t: next, in: next.start - now })
      : line.length ? { kind: 'done' } : { kind: 'none' }

  // how late we're running: the most recent heat the judges started vs its printed time
  const lastLive = line.filter((t) => t.live).at(-1)
  const lateMin = lastLive && lastLive.start != null && lastLive.sched != null ? Math.round((lastLive.start - lastLive.sched) / 60) : 0

  // rolling list: keep the current heat near the top
  const listRef = useRef<HTMLOListElement>(null)
  const focusId = onNow?.heat.id ?? next?.heat.id
  useEffect(() => {
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-id="${focusId}"]`)
    if (!list || !el) return
    // the row just before (or the break above it) stays visible for context
    const top = Math.max(0, el.offsetTop - 90)
    list.scrollTo({ top, behavior: 'smooth' })
  }, [focusId, line.length])

  // breaks between heats (e.g. between events) so the DJ can plan a longer set
  const rows: ({ type: 'heat'; t: TimedHeat } | { type: 'gap'; key: string; minutes: number; from: number })[] = []
  line.forEach((t, i) => {
    const prev = line[i - 1]
    if (prev?.end != null && t.start != null && t.start - prev.end >= 5 * 60) rows.push({ type: 'gap', key: `g${t.heat.id}`, minutes: Math.round((t.start - prev.end) / 60), from: prev.end })
    rows.push({ type: 'heat', t })
  })

  const done = line.filter((t) => t.state === 'done').length

  return (
    <main className={`dj dj-${cue.kind}`}>
      <header className="dj-top">
        <div className="dj-eq" aria-hidden>{Array.from({ length: 9 }, (_, k) => <i key={k} style={{ animationDelay: `${(k * 173) % 800 / -1000}s` }} />)}</div>
        <div className="dj-id"><b>DJ view</b><span>{promo.event_line}</span></div>
        <div className="dj-clock mono">{clockText(now)}<small>:{String(now % 60).padStart(2, '0')}</small></div>
      </header>
      {offline && <div className="dj-offline">No signal: times keep running from the schedule</div>}

      <section className="dj-main">
        <div className="dj-cue" key={`${cue.kind}-${'t' in cue ? cue.t.heat.id : ''}`}>
          {cue.kind === 'none' && <Big label="Waiting" title="Heat times will appear here" />}
          {cue.kind === 'done' && <Big label="All heats done" title="That’s a wrap" sub="Results go up once they’re checked" />}

          {(cue.kind === 'on' || cue.kind === 'final') && (
            <>
              <span className="dj-label">{cue.kind === 'final' ? '🔥 Final minute: turn it up' : '● On now'}</span>
              <h1>Event {cue.t.heat.workout_number} · Heat {cue.t.heat.number}</h1>
              <p className="dj-sub">{cue.t.heat.workout_name} · {divisions(cue.t.heat)}</p>
              <Ring left={cue.left} total={(cue.t.end ?? 0) - (cue.t.start ?? 0)} label="left" hot={cue.kind === 'final'} />
              <p className="dj-sub">Ends {clockText(cue.t.end!)}{next ? ` · next heat ${next.start != null ? clockText(next.start) : hhmm(next.heat.start_time)}` : ''}</p>
            </>
          )}

          {cue.kind === 'go' && (
            <>
              <span className="dj-label">{cue.t.waiting ? '⚡ Heat about to start: build it up' : 'Heat starting'}</span>
              {cue.t.waiting
                ? <h1>Waiting for the judges to start</h1>
                : <div className="dj-num" key={cue.in}>{cue.in > 0 ? cue.in : 'GO'}</div>}
              <p className="dj-sub">Event {cue.t.heat.workout_number} · Heat {cue.t.heat.number} · {divisions(cue.t.heat)}</p>
            </>
          )}

          {(cue.kind === 'ready' || cue.kind === 'break') && (
            <>
              <span className="dj-label">{cue.kind === 'ready' ? '⚡ Get ready: build it up' : cue.in > 10 * 60 ? '☕ Break' : 'Changeover'}</span>
              <h1>Event {cue.t.heat.workout_number} · Heat {cue.t.heat.number}</h1>
              <p className="dj-sub">{cue.t.heat.workout_name} · {divisions(cue.t.heat)}</p>
              <div className="dj-count mono">{countdown(cue.in)}</div>
              <p className="dj-sub">starts {cue.t.start != null ? clockText(cue.t.start) : hhmm(cue.t.heat.start_time)}{cue.t.start != null && cue.t.sched != null && cue.t.start - cue.t.sched >= 60 ? ` (was ${hhmm(cue.t.heat.start_time)})` : ''}</p>
            </>
          )}
        </div>

        <div className="dj-side">
          <div className="dj-side-head"><b>Running order</b><span>{done}/{line.length} heats done</span></div>
          {lateMin >= 1 && <div className="dj-floor">Running {lateMin} min behind: times below follow the judges</div>}
          <ol ref={listRef} className="dj-list">
            {rows.map((r) => r.type === 'gap' ? (
              <li key={r.key} className="gap"><span className="t mono">{clockText(r.from)}</span><span>Break · {r.minutes} min</span></li>
            ) : (
              <li key={r.t.heat.id} data-id={r.t.heat.id} className={r.t.state}>
                <span className="t mono">{r.t.start != null ? clockText(r.t.start) : hhmm(r.t.heat.start_time)}</span>
                <span className="w"><b>Event {r.t.heat.workout_number} · Heat {r.t.heat.number}</b><small>{divisions(r.t.heat)}</small></span>
                <span className="s">{r.t.state === 'now' ? 'On now' : r.t.state === 'next' ? 'Next' : r.t.state === 'done' ? '✓' : ''}</span>
              </li>
            ))}
            {!rows.length && <li className="later"><span className="w"><b>No heats yet</b></span></li>}
          </ol>
        </div>
      </section>
    </main>
  )
}

function Big({ label, title, sub }: { label: string; title: string; sub?: string }) {
  return <><span className="dj-label">{label}</span><h1>{title}</h1>{sub && <p className="dj-sub">{sub}</p>}</>
}

/** Countdown ring that drains as the heat runs. */
function Ring({ left, total, label, hot }: { left: number; total: number; label: string; hot: boolean }) {
  const r = 46, c = 2 * Math.PI * r
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0
  return (
    <div className={`dj-ring${hot ? ' hot' : ''}`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} className="bg" />
        <circle cx="50" cy="50" r={r} className="fg" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <div><b className="mono">{countdown(left)}</b><span>{label}</span></div>
    </div>
  )
}
