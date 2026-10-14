'use client'

import { useMemo, useState, useTransition } from 'react'
import { formatCap, partTitleOr, scoreTypeLabel } from '@/lib/types'
import { saveHeats, type HeatInput } from './actions'

interface Team { id: string; name: string; bib: number | null; division_id: string }
interface Judge { id: string; name: string; role: string }
interface Division { id: string; name: string; level: string; sex: string }
interface Movement { id: string; sort_order: number; name: string; reps: number | null; reps_female: number | null; rx_load: string | null; scaled_load: string | null }
interface Part { id: string; label: string; name: string; sort_order: number; score_type: 'for_time' | 'amrap' | 'max_reps' | 'max_load' | 'other'; time_cap_seconds: number | null; rounds: number; scored: boolean; part_movements: Movement[] }
interface Workout { id: string; number: number; name: string; description: string | null; parts: Part[] }

const uid = () => crypto.randomUUID()
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fromMin = (n: number) => `${String(Math.floor(((n % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((n % 60) + 60) % 60).padStart(2, '0')}`
const addMinutes = (t: string, m: number) => fromMin(toMin(t) + m)

function blankLanes(n: number): HeatInput['lanes'] {
  return Array.from({ length: n }, (_, i) => ({ lane: i + 1, team_id: null, judge_id: null }))
}

/** Active workout time in seconds: every part's window (timed rounds × window). */
function workoutSeconds(w: Workout) {
  return w.parts.reduce((n, p) => n + (p.time_cap_seconds ?? 0) * (p.score_type === 'for_time' ? Math.max(1, p.rounds) : 1), 0)
}

function DivisionTag({ d }: { d?: Division }) {
  if (!d) return null
  const rx = d.level === 'rx'
  return (
    <span className="pill" style={{
      background: rx ? 'rgba(201,167,10,0.14)' : 'rgba(59,130,246,0.14)', color: rx ? 'var(--gold-hi)' : '#7fb0ff',
      border: `1px solid ${rx ? 'rgba(201,167,10,0.35)' : 'rgba(59,130,246,0.35)'}`,
    }}>{d.name}</span>
  )
}

export function HeatsEditor({ workoutId, workout, lanesPerHeat, divisions, teams, judges, initial }: {
  workoutId: string; workout: Workout; lanesPerHeat: number; divisions: Division[]; teams: Team[]; judges: Judge[]; initial: HeatInput[]
}) {
  const [heats, setHeats] = useState<HeatInput[]>(() =>
    initial.map((h) => {
      const lanes = blankLanes(Math.max(lanesPerHeat, ...h.lanes.map((l) => l.lane)))
      for (const l of h.lanes) lanes[l.lane - 1] = { ...l }
      return { ...h, lanes }
    })
  )
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  const wSecs = workoutSeconds(workout)
  // timing plan
  const [firstStart, setFirstStart] = useState(initial[0]?.start_time ?? '09:00')
  const [heatLength, setHeatLength] = useState(String(Math.max(1, Math.ceil(wSecs / 60)) || 10))
  const [changeover, setChangeover] = useState('5')
  const [levelExtra, setLevelExtra] = useState('2')
  const [cascade, setCascade] = useState(true)

  // auto-fill options
  const [order, setOrder] = useState<string[]>(divisions.map((d) => d.id))
  const [splitByDivision, setSplitByDivision] = useState(true)
  const [laneJudges, setLaneJudges] = useState<(string | null)[]>(() => Array.from({ length: lanesPerHeat }, () => null))

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const divById = useMemo(() => new Map(divisions.map((d) => [d.id, d])), [divisions])
  const divOf = (teamId: string | null) => (teamId ? divById.get(teamById.get(teamId)?.division_id ?? '') : undefined)
  const used = new Map<string, number>()
  heats.forEach((h, i) => h.lanes.forEach((l) => l.team_id && used.set(l.team_id, i + 1)))
  const unplaced = teams.filter((t) => !used.has(t.id))

  const len = Number(heatLength) || 0
  const levelsOf = (h: HeatInput) => new Set(h.lanes.map((l) => divOf(l.team_id)?.level).filter(Boolean))
  const levelChange = (a: HeatInput, b: HeatInput) => {
    const la = levelsOf(a), lb = levelsOf(b)
    return la.size > 0 && lb.size > 0 && [...lb].some((x) => !la.has(x))
  }

  const touch = () => { setDirty(true); setMsg({}) }
  const setLane = (heatId: string, lane: number, patch: Partial<HeatInput['lanes'][number]>) => {
    touch()
    setHeats((hs) => hs.map((h) => (h.id !== heatId ? h : { ...h, lanes: h.lanes.map((l) => (l.lane === lane ? { ...l, ...patch } : l)) })))
  }

  /** Start times from the first heat: workout time + changeover (+ extra when RX ↔ Scaled). */
  function retime(list: HeatInput[], from = firstStart): HeatInput[] {
    let t = from
    return list.map((h, i) => {
      if (i > 0) {
        const extra = levelChange(list[i - 1], h) ? Number(levelExtra) || 0 : 0
        t = addMinutes(t, len + (Number(changeover) || 0) + extra)
      }
      return { ...h, start_time: t }
    })
  }

  /** Change one heat's time; later heats move by the same amount. */
  function setHeatTime(index: number, value: string) {
    touch()
    setHeats((hs) => {
      const old = hs[index].start_time
      const delta = old && value ? toMin(value) - toMin(old) : 0
      return hs.map((h, i) => {
        if (i === index) return { ...h, start_time: value || null }
        if (cascade && i > index && h.start_time && delta) return { ...h, start_time: addMinutes(h.start_time, delta) }
        return h
      })
    })
  }

  function autofill() {
    const out: HeatInput[] = []
    let current: HeatInput | null = null
    const newHeat = () => {
      current = { id: uid(), number: out.length + 1, start_time: null, lanes: blankLanes(lanesPerHeat).map((l, i) => ({ ...l, judge_id: laneJudges[i] ?? null })) }
      out.push(current)
      return current
    }
    for (const divId of order) {
      const list = teams.filter((t) => t.division_id === divId).sort((a, b) => (a.bib ?? 9999) - (b.bib ?? 9999) || a.name.localeCompare(b.name))
      if (!list.length) continue
      if (splitByDivision || !current) newHeat()
      for (const t of list) {
        let h = current as HeatInput | null
        let free = h?.lanes.find((l) => !l.team_id)
        if (!free) { h = newHeat(); free = h.lanes[0] }
        free.team_id = t.id
      }
    }
    touch()
    setHeats(retime(out))
  }

  function applyLaneJudges() {
    touch()
    setHeats((hs) => hs.map((h) => ({ ...h, lanes: h.lanes.map((l) => ({ ...l, judge_id: laneJudges[l.lane - 1] ?? l.judge_id })) })))
  }

  function save() {
    start(async () => {
      const res = await saveHeats(workoutId, heats.map((h, i) => ({ ...h, number: i + 1 })))
      if (res.error) setMsg({ error: res.error })
      else { setMsg({ ok: 'Saved' }); setDirty(false) }
    })
  }

  const lbl = { fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--subtle)' }
  const last = heats.at(-1)

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* ── The workout ── */}
      <section className="card stack-sm">
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <h2>Event {workout.number} · {workout.name}</h2>
          <span className="small muted">Workout time <b className="mono" style={{ color: 'var(--text)' }}>{formatCap(wSecs)}</b></span>
        </div>
        {workout.description && <p className="small muted">{workout.description}</p>}
        <div className="grid-2" style={{ gap: 14 }}>
          {[...workout.parts].sort((a, b) => a.sort_order - b.sort_order).map((p) => (
            <div key={p.id} className="stack-sm" style={{ gap: 4 }}>
              <span className="small" style={{ fontWeight: 700 }}>
                {workout.parts.length > 1 ? `${partTitleOr(p, workout.parts.indexOf(p))} · ` : ''}{scoreTypeLabel(p.score_type)}
                {' · '}{p.score_type === 'for_time' && p.rounds > 1 ? `${p.rounds} × ${formatCap(p.time_cap_seconds)} windows` : p.time_cap_seconds ? `${formatCap(p.time_cap_seconds)} cap` : 'no cap'}
                {!p.scored && ' · buy-in'}
              </span>
              {[...p.part_movements].sort((a, b) => a.sort_order - b.sort_order).map((m) => (
                <span key={m.id} className="small muted">
                  {m.reps != null ? `${m.reps}${m.reps_female != null && m.reps_female !== m.reps ? `/${m.reps_female}` : ''} ` : ''}{m.name}
                  {m.rx_load ? ` · RX ${m.rx_load}` : ''}{m.scaled_load ? ` · Scaled ${m.scaled_load}` : ''}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── Quick setup ── */}
      <section className="card stack">
        <div className="spread" style={{ alignItems: 'center' }}>
          <h2>Quick setup</h2>
          <span className="small subtle">{teams.length} teams · {lanesPerHeat} lanes per heat (change in Settings)</span>
        </div>
        <div className="grid-2">
          <div className="stack-sm">
            <span style={lbl}>Division order</span>
            {order.map((id, i) => (
              <div key={id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <span className="row" style={{ gap: 8 }}>{i + 1}. <DivisionTag d={divById.get(id)} /> <span className="subtle small">{teams.filter((t) => t.division_id === id).length} teams</span></span>
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="linkbtn" disabled={i === 0} onClick={() => setOrder((o) => { const n = [...o]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })} aria-label="Move up">▲</button>
                  <button type="button" className="linkbtn" disabled={i === order.length - 1} onClick={() => setOrder((o) => { const n = [...o]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n })} aria-label="Move down">▼</button>
                </span>
              </div>
            ))}
            <label className="check"><input type="checkbox" checked={splitByDivision} onChange={(e) => setSplitByDivision(e.target.checked)} />Start a new heat for each division</label>
            <span style={{ ...lbl, marginTop: 8 }}>Judge for each lane</span>
            <div className="grid-2" style={{ gap: 8 }}>
              {laneJudges.map((j, i) => (
                <label key={i} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <span className="mono small subtle" style={{ width: 44 }}>Lane {i + 1}</span>
                  <select className="input" value={j ?? ''} onChange={(e) => setLaneJudges((l) => l.map((x, k) => (k === i ? e.target.value || null : x)))} aria-label={`Judge for lane ${i + 1}`}>
                    <option value="">—</option>
                    {judges.map((jj) => <option key={jj.id} value={jj.id}>{jj.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="stack-sm">
            <span style={lbl}>Timing</span>
            <div className="grid-2" style={{ gap: 10 }}>
              <label className="field"><span>First heat starts</span><input id="first-start" type="time" className="input mono" value={firstStart} onChange={(e) => setFirstStart(e.target.value)} /></label>
              <label className="field"><span>Workout time (min)</span><input id="heat-length" inputMode="numeric" className="input mono" value={heatLength} onChange={(e) => setHeatLength(e.target.value.replace(/\D/g, ''))} /></label>
              <label className="field"><span>Changeover between heats (min)</span><input id="changeover" inputMode="numeric" className="input mono" value={changeover} onChange={(e) => setChangeover(e.target.value.replace(/\D/g, ''))} /></label>
              <label className="field"><span>Extra when switching RX ↔ Scaled (min)</span><input id="level-extra" inputMode="numeric" className="input mono" value={levelExtra} onChange={(e) => setLevelExtra(e.target.value.replace(/\D/g, ''))} /></label>
            </div>
            <p className="small subtle">
              Heats start every {len + (Number(changeover) || 0)} min ({len} min workout + {Number(changeover) || 0} min changeover),
              plus {Number(levelExtra) || 0} min whenever the next heat switches between RX and Scaled (equipment change).
            </p>
            <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} disabled={!heats.length} onClick={() => { touch(); setHeats((hs) => retime(hs)) }}>
              Recalculate all heat times
            </button>
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={autofill}>Fill heats with all teams</button>
          <button type="button" className="btn btn-ghost" onClick={applyLaneJudges} disabled={!heats.length}>Apply lane judges to every heat</button>
          {heats.length > 0 && <span className="small subtle">Filling replaces the heats below. Nothing is saved until you press Save.</span>}
        </div>
      </section>

      {/* ── Timing layout ── */}
      {heats.length > 0 && (
        <section className="card stack-sm">
          <div className="spread" style={{ alignItems: 'baseline' }}>
            <h2>Timing layout</h2>
            {heats[0].start_time && last?.start_time && (
              <span className="small muted">
                {heats[0].start_time} → last heat finishes <b className="mono" style={{ color: 'var(--text)' }}>{addMinutes(last.start_time, len)}</b>
                {' '}({Math.round((toMin(last.start_time) + len - toMin(heats[0].start_time)))} min)
              </span>
            )}
          </div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 600 }}>
              <thead><tr><th>Heat</th><th>Start</th><th>Finish</th><th>Divisions</th><th>Gap before next heat</th></tr></thead>
              <tbody>
                {heats.map((h, i) => {
                  const next = heats[i + 1]
                  const end = h.start_time ? addMinutes(h.start_time, len) : null
                  const gap = end && next?.start_time ? toMin(next.start_time) - toMin(end) : null
                  const divs = [...new Set(h.lanes.map((l) => divOf(l.team_id)?.id).filter(Boolean))] as string[]
                  return (
                    <tr key={h.id}>
                      <td className="mono">{i + 1}</td>
                      <td className="mono">{h.start_time ?? '—'}</td>
                      <td className="mono">{end ?? '—'}</td>
                      <td><span className="row" style={{ gap: 4 }}>{divs.map((d) => <DivisionTag key={d} d={divById.get(d)} />)}</span></td>
                      <td>
                        {gap == null ? '' : (
                          <span className={`pill ${gap < 0 ? 'pill-bad' : gap < 2 ? 'pill-warn' : 'pill-dim'}`}>
                            {gap < 0 ? `Overlaps by ${-gap} min` : `${gap} min`}{next && levelChange(h, next) ? ' · RX ↔ Scaled' : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Heats ── */}
      <div className="spread" style={{ alignItems: 'center' }}>
        <h2>{heats.length} heats</h2>
        <div className="row">
          <label className="check"><input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />Changing a time moves the heats after it</label>
          {msg.ok && !dirty && <span className="pill pill-ok">{msg.ok}</span>}
          {dirty && <span className="small subtle">Unsaved changes</span>}
          <button type="button" className="btn btn-ghost" onClick={() => {
            touch()
            setHeats((hs) => {
              const prev = hs.at(-1)
              const t = prev?.start_time ? addMinutes(prev.start_time, len + (Number(changeover) || 0)) : firstStart
              return [...hs, { id: uid(), number: hs.length + 1, start_time: t, lanes: blankLanes(lanesPerHeat).map((l, i) => ({ ...l, judge_id: laneJudges[i] ?? null })) }]
            })
          }}>+ Add heat</button>
          <button type="button" className="btn" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save heats'}</button>
        </div>
      </div>
      {msg.error && <p className="notice notice-bad">{msg.error}</p>}
      {unplaced.length > 0 && heats.length > 0 && (
        <p className="notice">Not in a heat yet: {unplaced.map((t) => t.name).join(', ')}</p>
      )}
      {heats.length === 0 && <div className="empty">No heats yet. Use “Fill heats with all teams” above, or add one by hand.</div>}

      {heats.map((h, hi) => {
        const judgeCount = new Map<string, number>()
        h.lanes.forEach((l) => l.judge_id && judgeCount.set(l.judge_id, (judgeCount.get(l.judge_id) ?? 0) + 1))
        const divs = [...new Set(h.lanes.map((l) => divOf(l.team_id)?.id).filter(Boolean))] as string[]
        return (
          <section key={h.id} className="card stack-sm" style={{ padding: '14px 16px' }}>
            <div className="spread" style={{ alignItems: 'center' }}>
              <div className="row">
                <h3 style={{ fontSize: '1.3rem' }}>Heat {hi + 1}</h3>
                <input type="time" className="input mono" style={{ width: 130 }} value={h.start_time ?? ''} aria-label={`Heat ${hi + 1} start time`}
                  onChange={(e) => setHeatTime(hi, e.target.value)} />
                {h.start_time && <span className="small subtle">to {addMinutes(h.start_time, len)}</span>}
                <span className="row" style={{ gap: 4 }}>{divs.map((d) => <DivisionTag key={d} d={divById.get(d)} />)}</span>
              </div>
              <button type="button" className="linkbtn danger" onClick={() => { touch(); setHeats((hs) => hs.filter((x) => x.id !== h.id)) }}>Remove heat</button>
            </div>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 720 }}>
                <thead><tr><th style={{ width: 60 }}>Lane</th><th>Team</th><th style={{ width: 150 }}>Division</th><th>Judge</th></tr></thead>
                <tbody>
                  {h.lanes.map((l) => {
                    const otherHeat = l.team_id ? heats.findIndex((x) => x.id !== h.id && x.lanes.some((y) => y.team_id === l.team_id)) : -1
                    return (
                      <tr key={l.lane}>
                        <td className="mono">{l.lane}</td>
                        <td>
                          <select className="input" value={l.team_id ?? ''} aria-label={`Heat ${hi + 1} lane ${l.lane} team`} onChange={(e) => setLane(h.id, l.lane, { team_id: e.target.value || null })}>
                            <option value="">— empty —</option>
                            {divisions.map((d) => (
                              <optgroup key={d.id} label={d.name}>
                                {teams.filter((t) => t.division_id === d.id).map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}{used.has(t.id) && used.get(t.id) !== hi + 1 && t.id !== l.team_id ? ` (heat ${used.get(t.id)})` : ''}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          {otherHeat >= 0 && <span className="pill pill-bad" style={{ marginTop: 4 }}>Also in heat {otherHeat + 1}</span>}
                        </td>
                        <td><DivisionTag d={divOf(l.team_id)} /></td>
                        <td>
                          <select className="input" value={l.judge_id ?? ''} aria-label={`Heat ${hi + 1} lane ${l.lane} judge`} onChange={(e) => setLane(h.id, l.lane, { judge_id: e.target.value || null })}>
                            <option value="">— no judge —</option>
                            {judges.map((j) => <option key={j.id} value={j.id}>{j.name}{j.role === 'head' ? ' (head)' : ''}</option>)}
                          </select>
                          {l.judge_id && (judgeCount.get(l.judge_id) ?? 0) > 1 && <span className="pill pill-warn" style={{ marginTop: 4 }}>Judging 2 lanes</span>}
                          {l.team_id && !l.judge_id && <span className="pill pill-warn" style={{ marginTop: 4 }}>No judge</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
