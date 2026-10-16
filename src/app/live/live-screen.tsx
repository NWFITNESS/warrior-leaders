'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Logo } from '@/components/Logo'
import { activePart, formatTime, heatClock, hhmm, laneStates, ordinal, partTitle, type LiveData, type LiveHeat } from '@/lib/live'

const POLL_MS = 2000

let client: SupabaseClient | null = null
function db() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

function useLive(heatId: string | null) {
  const [data, setData] = useState<LiveData | null>(null)
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data: d, error } = await db().rpc('wl_public_live', heatId ? { p_heat: heatId } : {})
      if (!alive) return
      if (error || !d) { setOffline(true); return }
      setOffline(false)
      setData(d as LiveData)
    }
    void load()
    const id = window.setInterval(load, POLL_MS)
    return () => { alive = false; window.clearInterval(id) }
  }, [heatId])
  return { data, offline }
}

function useNow(ms = 200) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(id) }, [ms])
  return now
}

const levelOf = (heat: LiveHeat) => [...new Set(heat.lanes.map((l) => l.level))]
const divisionsOf = (heat: LiveHeat) => [...new Set(heat.lanes.map((l) => l.division))]

export function LiveScreen({ mode, heatId }: { mode: 'split' | 'race' | 'heats'; heatId: string | null }) {
  const { data, offline } = useLive(heatId)
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
          {mode !== 'race' && <HeatTimes data={data} current={heat} />}
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
              <span className={`lr-fill${s.fraction < 0.35 ? ' short' : ''}`} style={{ width: `${Math.round(Math.max(s.started ? 0.02 : 0, s.fraction) * 1000) / 10}%` }}>
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

// ── Right: heat times ──────────────────────────────────────────────────────────
function HeatTimes({ data, current }: { data: LiveData; current: LiveHeat | null }) {
  const heats = data.heats
  const i = Math.max(0, heats.findIndex((h) => h.id === current?.id))
  const shown = heats.slice(Math.max(0, i - 1), Math.max(0, i - 1) + 9)
  const next = heats[i + 1]

  return (
    <aside className="live-heats">
      <span className="eyebrow">Heat times</span>
      {!heats.length && <div className="empty">Heat times will be published before the day.</div>}
      <ol>
        {shown.map((h) => {
          const k = heats.indexOf(h)
          const state = h.id === current?.id ? 'now' : k < i ? 'past' : h.id === next?.id ? 'next' : ''
          return (
            <li key={h.id} className={state}>
              <span className="t mono">{hhmm(h.start_time)}</span>
              <span className="w">
                <b>Event {h.workout_number} · Heat {h.number}</b>
                <small>{divisionsOf(h).join(' · ') || 'Lanes to be set'}</small>
                {state === 'next' && h.lanes.length > 0 && (
                  <span className="lanes">{h.lanes.map((l) => <span key={l.lane}><i>{l.lane}</i>{l.team_name}</span>)}</span>
                )}
              </span>
              <span className="s">
                {state === 'now' ? 'Now' : state === 'next' ? 'Next' : state === 'past' ? 'Done' : ''}
                {levelOf(h).length === 1 && <small className={levelOf(h)[0] === 'scaled' ? 'sc' : 'rx'}>{levelOf(h)[0] === 'scaled' ? 'Scaled' : 'RX'}</small>}
              </span>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
