'use client'

import { useMemo, useState, useTransition } from 'react'
import { saveHeats, type HeatInput } from './actions'

interface Team { id: string; name: string; bib: number | null; division_id: string }
interface Judge { id: string; name: string; role: string }
interface Division { id: string; name: string }

const uid = () => crypto.randomUUID()

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function blankLanes(n: number): HeatInput['lanes'] {
  return Array.from({ length: n }, (_, i) => ({ lane: i + 1, team_id: null, judge_id: null }))
}

export function HeatsEditor({ workoutId, lanesPerHeat, divisions, teams, judges, initial }: {
  workoutId: string; lanesPerHeat: number; divisions: Division[]; teams: Team[]; judges: Judge[]; initial: HeatInput[]
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

  // auto-fill options
  const [order, setOrder] = useState<string[]>(divisions.map((d) => d.id))
  const [splitByDivision, setSplitByDivision] = useState(true)
  const [firstStart, setFirstStart] = useState('09:00')
  const [gap, setGap] = useState('12')
  const [laneJudges, setLaneJudges] = useState<(string | null)[]>(() => Array.from({ length: lanesPerHeat }, () => null))

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const divName = (id: string) => divisions.find((d) => d.id === id)?.name ?? ''
  const used = new Map<string, number>()
  heats.forEach((h, i) => h.lanes.forEach((l) => l.team_id && used.set(l.team_id, i + 1)))
  const unplaced = teams.filter((t) => !used.has(t.id))

  const touch = () => { setDirty(true); setMsg({}) }
  const setLane = (heatId: string, lane: number, patch: Partial<HeatInput['lanes'][number]>) => {
    touch()
    setHeats((hs) => hs.map((h) => (h.id !== heatId ? h : { ...h, lanes: h.lanes.map((l) => (l.lane === lane ? { ...l, ...patch } : l)) })))
  }

  function autofill() {
    const out: HeatInput[] = []
    let current: HeatInput | null = null
    let time = firstStart
    const newHeat = () => {
      current = { id: uid(), number: out.length + 1, start_time: time, lanes: blankLanes(lanesPerHeat).map((l, i) => ({ ...l, judge_id: laneJudges[i] ?? null })) }
      out.push(current)
      time = addMinutes(time, Number(gap) || 0)
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
    setHeats(out)
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

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card stack">
        <div className="spread" style={{ alignItems: 'center' }}>
          <h2>Quick setup</h2>
          <span className="small subtle">{teams.length} teams · {lanesPerHeat} lanes per heat (change in Settings)</span>
        </div>
        <div className="grid-2">
          <div className="stack-sm">
            <span className="lbl" style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--subtle)' }}>Division order</span>
            {order.map((id, i) => (
              <div key={id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <span>{i + 1}. {divName(id)} <span className="subtle small">({teams.filter((t) => t.division_id === id).length})</span></span>
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="linkbtn" disabled={i === 0} onClick={() => setOrder((o) => { const n = [...o]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })} aria-label="Move up">▲</button>
                  <button type="button" className="linkbtn" disabled={i === order.length - 1} onClick={() => setOrder((o) => { const n = [...o]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n })} aria-label="Move down">▼</button>
                </span>
              </div>
            ))}
            <label className="check"><input type="checkbox" checked={splitByDivision} onChange={(e) => setSplitByDivision(e.target.checked)} />Start a new heat for each division</label>
          </div>
          <div className="stack-sm">
            <div className="grid-2" style={{ gap: 10 }}>
              <label className="field"><span>First heat starts</span><input id="first-start" type="time" className="input mono" value={firstStart} onChange={(e) => setFirstStart(e.target.value)} /></label>
              <label className="field"><span>Minutes between heats</span><input id="heat-gap" inputMode="numeric" className="input mono" value={gap} onChange={(e) => setGap(e.target.value.replace(/\D/g, ''))} /></label>
            </div>
            <span className="lbl" style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--subtle)', marginTop: 6 }}>Judge for each lane</span>
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
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={autofill}>Fill heats with all teams</button>
          <button type="button" className="btn btn-ghost" onClick={applyLaneJudges} disabled={!heats.length}>Apply lane judges to every heat</button>
          {heats.length > 0 && <span className="small subtle">Filling replaces the heats below (nothing is saved until you press Save).</span>}
        </div>
      </section>

      <div className="spread" style={{ alignItems: 'center' }}>
        <h2>{heats.length} heats</h2>
        <div className="row">
          {msg.ok && !dirty && <span className="pill pill-ok">{msg.ok}</span>}
          {dirty && <span className="small subtle">Unsaved changes</span>}
          <button type="button" className="btn btn-ghost" onClick={() => { touch(); setHeats((hs) => [...hs, { id: uid(), number: hs.length + 1, start_time: hs.at(-1)?.start_time ? addMinutes(hs.at(-1)!.start_time!, Number(gap) || 0) : null, lanes: blankLanes(lanesPerHeat).map((l, i) => ({ ...l, judge_id: laneJudges[i] ?? null })) }]) }}>+ Add heat</button>
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
        const divs = [...new Set(h.lanes.map((l) => (l.team_id ? divName(teamById.get(l.team_id)?.division_id ?? '') : null)).filter(Boolean))]
        return (
          <section key={h.id} className="card stack-sm" style={{ padding: '14px 16px' }}>
            <div className="spread" style={{ alignItems: 'center' }}>
              <div className="row">
                <h3 style={{ fontSize: '1.3rem' }}>Heat {hi + 1}</h3>
                <input type="time" className="input mono" style={{ width: 130 }} value={h.start_time ?? ''} aria-label={`Heat ${hi + 1} start time`}
                  onChange={(e) => { touch(); setHeats((hs) => hs.map((x) => (x.id === h.id ? { ...x, start_time: e.target.value || null } : x))) }} />
                <span className="small subtle">{divs.join(' · ')}</span>
              </div>
              <button type="button" className="linkbtn danger" onClick={() => { touch(); setHeats((hs) => hs.filter((x) => x.id !== h.id)) }}>Remove heat</button>
            </div>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 640 }}>
                <thead><tr><th style={{ width: 60 }}>Lane</th><th>Team</th><th>Judge</th></tr></thead>
                <tbody>
                  {h.lanes.map((l) => {
                    const otherHeat = l.team_id ? [...heats].findIndex((x) => x.id !== h.id && x.lanes.some((y) => y.team_id === l.team_id)) : -1
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
