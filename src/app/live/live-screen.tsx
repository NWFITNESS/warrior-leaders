'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Logo } from '@/components/Logo'
import {
  activePart, clockText, countdown, formatTime, heatClock, heatTimeline, hhmm, laneStates, londonSeconds, ordinal, partTitle,
  type LiveData, type LiveHeat, type TimedHeat,
} from '@/lib/live'

const POLL_MS = 2000

let client: SupabaseClient | null = null
function db() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

function useLive(heatId: string | null, fallback: string | null) {
  const [data, setData] = useState<LiveData | null>(null)
  const [offline, setOffline] = useState(false)
  const [offset, setOffset] = useState(0) // server clock − this screen's clock
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data: d, error } = await db().rpc('wl_public_live', { p_heat: heatId, p_fallback: fallback })
      if (!alive) return
      if (error || !d) { setOffline(true); return }
      setOffline(false)
      setData(d as LiveData)
      if ((d as LiveData).server_now) setOffset((d as LiveData).server_now - Date.now())
    }
    void load()
    const id = window.setInterval(load, POLL_MS)
    return () => { alive = false; window.clearInterval(id) }
  }, [heatId, fallback])
  return { data, offline, offset }
}

function useNow(ms = 200) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(id) }, [ms])
  return now
}

/** UK time of day in seconds, corrected to the server clock. Rehearsal (?at=09:25) starts from that time instead. */
function useClock(offset: number, at: string | null) {
  const ms = useNow(1000) + offset
  const [opened] = useState(() => Date.now())
  if (!at) return londonSeconds(ms)
  const [h, m] = at.split(':').map(Number)
  return h * 3600 + m * 60 + Math.floor((ms - offset - opened) / 1000)
}

const levelOf = (heat: LiveHeat) => [...new Set(heat.lanes.map((l) => l.level))]
const divisionsOf = (heat: LiveHeat) => [...new Set(heat.lanes.map((l) => l.division))]

export function LiveScreen({ mode, heatId, at }: { mode: 'split' | 'race' | 'heats'; heatId: string | null; at: string | null }) {
  // the heat that's on now (or next, or the last one) by the clock: the race shows it when nobody is scoring
  const [fallback, setFallback] = useState<string | null>(null)
  const { data, offline, offset } = useLive(heatId, fallback)
  const now = useClock(offset, at)
  const line = data ? heatTimeline(data.heats, now) : []
  const byClock = (line.find((t) => t.state === 'now') ?? line.find((t) => t.state === 'next') ?? line.filter((t) => t.state === 'done').at(-1))?.heat.id ?? null
  useEffect(() => { if (byClock !== fallback) setFallback(byClock) }, [byClock, fallback])
  const heat = data?.heats.find((h) => h.id === data.heat_id) ?? null

  return (
    <main className={`live live-${mode}`}>
      <header className="live-head">
        <Logo width={170} />
        <div className="live-title">
          {heat ? (
            <>
              <span className="eyebrow">Event {heat.workout_number} · Heat {heat.number} · {hhmm(heat.start_time)}</span>
              <h1>{heat.workout_name}</h1>
            </>
          ) : (
            <h1>The Warrior <b style={{ color: 'var(--gold-hi)' }}>Leaders</b></h1>
          )}
        </div>
        {offline && <span className="j-sync bad">Reconnecting…</span>}
      </header>

      {!data ? (
        <div className="empty" style={{ alignSelf: 'center', fontSize: '1.6vw' }}>Loading…</div>
      ) : (
        <div className="live-body">
          {mode !== 'heats' && <Race data={data} heat={heat} />}
          {mode !== 'race' && <HeatTimes data={data} now={now} />}
        </div>
      )}

      <footer className="spread subtle" style={{ fontSize: '0.9vw' }}>
        <span>leaders.northernwarrior.co.uk</span>
        <span>Live from the judges · results are official once released</span>
      </footer>
    </main>
  )
}

// ── Left: the dog race ─────────────────────────────────────────────────────────
function Race({ data, heat }: { data: LiveData; heat: LiveHeat | null }) {
  const now = useNow()
  const part = activePart(data)
  const states = useMemo(() => (heat && part ? laneStates(heat, part, data.progress) : []), [heat, part, data.progress])

  if (!heat) return <section className="live-race"><div className="empty" style={{ fontSize: '1.4vw' }}>Heats will show here once they’re set.</div></section>
  if (!part) return <section className="live-race"><div className="empty" style={{ fontSize: '1.4vw' }}>This workout has no parts set up yet.</div></section>

  const since = heatClock(states)
  const cap = part.time_cap_seconds
  const elapsed = since != null ? (now - since) / 1000 : null
  const allDone = states.length > 0 && states.every((s) => s.finished)
  const title = partTitle(part)
  const multiRound = part.score_type === 'for_time' && part.rounds > 1

  return (
    <section className="live-race">
      <div className="live-race-top">
        <div>
          <span className="eyebrow">{allDone ? 'Heat complete' : since != null ? 'Live' : 'Up now'}</span>
          {(title || multiRound) && <div className="subtle" style={{ fontSize: '1.1vw' }}>{[title, multiRound ? `${part.rounds} rounds × ${formatTime(cap, false)}` : null].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className={`live-clock${cap != null && elapsed != null && cap - elapsed <= 10 ? ' over' : ''}`}>
          {elapsed != null ? formatTime(cap != null ? Math.min(elapsed, cap) : elapsed, false) : '0:00'}
          {cap != null && <small>/ {formatTime(cap, false)}</small>}
        </div>
      </div>

      <div className="live-lanes">
        {states.map((s) => (
          <div key={s.lane.lane_assignment_id} className={`lr${s.finished ? ' done' : ''}${s.place === 1 && s.started ? ' lead' : ''}`}>
            <span className="lr-lane">{s.lane.lane}</span>
            <span className="lr-team">
              <b>{s.lane.team_name}</b>
              <small className={s.lane.level === 'scaled' ? 'sc' : 'rx'}>{s.lane.division}</small>
            </span>
            <span className={`lr-track ${s.lane.level === 'scaled' ? 'sc' : 'rx'}`}>
              <span className={`lr-fill${s.fraction < 0.6 ? ' short' : ''}`} style={{ width: `${Math.round(Math.max(s.started ? 0.02 : 0, s.fraction) * 1000) / 10}%` }}>
                {s.now && <em>{s.now}</em>}
              </span>
            </span>
            <span className="lr-res">
              {s.place != null && <i>{ordinal(s.place)}</i>}
              <b className="mono">{s.started ? s.result : '—'}</b>
            </span>
          </div>
        ))}
        {!states.length && <div className="empty">No teams in this heat yet.</div>}
      </div>
    </section>
  )
}

// ── Right: heat times, on the clock ────────────────────────────────────────────
// Runs on the start times set in Admin → Heats (not on the judges): On now → Coming up.
function HeatTimes({ data, now }: { data: LiveData; now: number }) {
  const line = heatTimeline(data.heats, now)
  const onNow = line.filter((t) => t.state === 'now')
  const next = line.find((t) => t.state === 'next')
  const later = line.filter((t) => t.state === 'later')
  const anyDone = line.some((t) => t.state === 'done')
  // while a heat is on, the next one heads the list; in a changeover it's the big card instead
  const upcoming = (onNow.length ? [next, ...later] : later).filter((t): t is TimedHeat => !!t)

  return (
    <aside className="live-heats">
      <div className="spread" style={{ alignItems: 'baseline' }}>
        <span className="eyebrow">Heat times</span>
        <span className="mono subtle" style={{ fontSize: '1.2vw' }}>{clockText(now)}</span>
      </div>
      {!data.heats.length && <div className="empty">Heat times will be published before the day.</div>}

      {onNow.map((t) => <Featured key={t.heat.id} t={t} now={now} kind="now" />)}
      {!onNow.length && next && <Featured t={next} now={now} kind={anyDone ? 'changeover' : 'first'} />}
      {!onNow.length && !next && anyDone && <div className="empty">That’s every heat done. Results go up once they’re checked.</div>}

      {upcoming.length > 0 && (
        <>
          <span className="eyebrow" style={{ marginTop: '0.4vh' }}>Coming up</span>
          <ol>
            {upcoming.slice(0, onNow.length ? 3 : 4).map((t, k) => (
              <li key={t.heat.id} className={k === 0 && onNow.length ? 'next' : ''}>
                <span className="t mono">{hhmm(t.heat.start_time)}</span>
                <span className="w">
                  <b>Event {t.heat.workout_number} · Heat {t.heat.number}</b>
                  <small>{divisionsOf(t.heat).join(' · ') || 'Lanes to be set'}</small>
                  {k === 0 && onNow.length > 0 && <LaneList heat={t.heat} />}
                </span>
                <span className="s">
                  {t.start != null && t.start - now < 3600 ? `in ${Math.max(1, Math.ceil((t.start - now) / 60))} min` : ''}
                  <LevelTag heat={t.heat} />
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  )
}

function Featured({ t, now, kind }: { t: TimedHeat; now: number; kind: 'now' | 'changeover' | 'first' }) {
  const h = t.heat
  const live = kind === 'now'
  const left = live ? (t.end ?? now) - now : (t.start ?? now) - now
  const span = live && t.start != null && t.end != null ? t.end - t.start : 0
  return (
    <div className={`live-feature${live ? ' now' : ''}`}>
      <div className="spread" style={{ alignItems: 'baseline' }}>
        <span className="eyebrow">{live ? 'On now' : kind === 'changeover' ? 'Changeover · get ready' : 'First heat'}</span>
        <span className="mono" style={{ fontSize: '1.1vw', color: 'var(--subtle)' }}>{hhmm(h.start_time)}{t.end != null ? `–${clockText(t.end)}` : ''}</span>
      </div>
      <b className="ft">Event {h.workout_number} · Heat {h.number}</b>
      <span className="fd">{h.workout_name} · {divisionsOf(h).join(' · ')}</span>
      <div className="fc">
        <span>{live ? 'Ends in' : 'Starts in'}</span>
        <b className="mono">{countdown(left)}</b>
      </div>
      {live && span > 0 && <span className="fbar"><span style={{ width: `${Math.min(100, Math.max(0, (1 - left / span) * 100))}%` }} /></span>}
      <LaneList heat={h} />
    </div>
  )
}

function LaneList({ heat }: { heat: LiveHeat }) {
  if (!heat.lanes.length) return null
  return <span className="lanes">{heat.lanes.map((l) => <span key={l.lane}><i>{l.lane}</i>{l.team_name}</span>)}</span>
}

function LevelTag({ heat }: { heat: LiveHeat }) {
  const levels = levelOf(heat)
  if (levels.length !== 1) return null
  return <small className={levels[0] === 'scaled' ? 'sc' : 'rx'}>{levels[0] === 'scaled' ? 'Scaled' : 'RX'}</small>
}
