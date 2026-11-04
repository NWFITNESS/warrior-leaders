'use client'

import { useMemo, useState, useTransition } from 'react'
import { saveHeats, type HeatInput } from '../heats/actions'

export interface FinalDivision {
  id: string; name: string; level: string
  standings: { teamId: string; team: string; rank: number; total: number; scored: number }[]
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`

/** Lane numbers in the order the qualifiers fill them. */
function laneOrder(lanes: number, teams: number, mode: 'rank' | 'centre') {
  const all = Array.from({ length: lanes }, (_, i) => i + 1)
  if (mode === 'rank') return all.slice(0, teams)
  const mid = (lanes + 1) / 2
  // nearest the middle first; on a tie the lower lane first
  return [...all].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b).slice(0, teams)
}

export function FinalBuilder({ workoutId, divisions, lanesPerHeat, heatMinutes, firstStart, existingHeats }: {
  workoutId: string; divisions: FinalDivision[]; lanesPerHeat: number; heatMinutes: number; firstStart: string; existingHeats: number
}) {
  const [topN, setTopN] = useState<Record<string, string>>(() => Object.fromEntries(divisions.map((d) => [d.id, String(Math.min(5, lanesPerHeat))])))
  const [order, setOrder] = useState(divisions.map((d) => d.id))
  const [laneMode, setLaneMode] = useState<'rank' | 'centre'>('centre')
  const [start, setStart] = useState(firstStart)
  const [minutes, setMinutes] = useState(String(heatMinutes))
  const [changeover, setChangeover] = useState('5')
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [pending, startT] = useTransition()

  const byId = new Map(divisions.map((d) => [d.id, d]))
  const n = (id: string) => Math.max(0, Math.min(Number(topN[id]) || 0, byId.get(id)?.standings.length ?? 0))

  // one heat per division (more if more qualify than there are lanes; the lower-ranked heat goes first)
  const heats = useMemo(() => {
    const out: { divisionId: string; label: string; start: string; lanes: { lane: number; teamId: string; team: string; rank: number }[] }[] = []
    let t = toMin(start || '16:00')
    for (const id of order) {
      const d = byId.get(id)!
      const q = d.standings.slice(0, n(id))
      if (!q.length) continue
      const chunks: typeof q[] = []
      for (let i = 0; i < q.length; i += lanesPerHeat) chunks.push(q.slice(i, i + lanesPerHeat))
      chunks.reverse().forEach((c, ci) => {
        const lanes = laneOrder(lanesPerHeat, c.length, laneMode)
        out.push({
          divisionId: id, label: chunks.length > 1 ? `${d.name} (${ci === chunks.length - 1 ? 'top' : 'next'} ${c.length})` : d.name, start: fromMin(t),
          lanes: c.map((s, i) => ({ lane: lanes[i], teamId: s.teamId, team: s.team, rank: s.rank })).sort((a, b) => a.lane - b.lane),
        })
        t += (Number(minutes) || 0) + (Number(changeover) || 0)
      })
    }
    return out
  }, [order, topN, laneMode, start, minutes, changeover]) // eslint-disable-line react-hooks/exhaustive-deps

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]; [next[i], next[j]] = [next[j], next[i]]; setOrder(next)
  }

  function save() {
    if (existingHeats && !window.confirm(`The final already has ${existingHeats} heat${existingHeats > 1 ? 's' : ''}. Replace them with these?`)) return
    setMsg({})
    const input: HeatInput[] = heats.map((h, i) => ({
      id: crypto.randomUUID(), number: i + 1, start_time: h.start,
      lanes: h.lanes.map((l) => ({ lane: l.lane, team_id: l.teamId, judge_id: null })),
    }))
    startT(async () => {
      const res = await saveHeats(workoutId, input, Number(minutes) || null)
      setMsg(res.error ? { error: res.error } : { ok: `Saved ${input.length} final heats. Fine-tune lanes or times in Heats & lanes.` })
    })
  }

  return (
    <div className="final-grid">
      <section className="card stack">
        <h2>Who goes through</h2>
        {divisions.map((d) => {
          const k = n(d.id)
          const cut = d.standings[k - 1]
          const tied = cut && d.standings[k]?.rank === cut.rank
          return (
            <div key={d.id} className="stack-sm final-div">
              <div className="spread" style={{ alignItems: 'center' }}>
                <h3>{d.name}</h3>
                <label className="row small muted" style={{ gap: 8 }}>
                  Top
                  <input className="input mono" style={{ width: 64 }} inputMode="numeric" aria-label={`${d.name} qualifiers`}
                    value={topN[d.id]} onChange={(e) => setTopN({ ...topN, [d.id]: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                  <span>of {d.standings.length}</span>
                </label>
              </div>
              {tied && <p className="notice notice-bad small">Tie for {ordinal(cut.rank)}: {d.standings.filter((s) => s.rank === cut.rank).map((s) => s.team).join(', ')}. Decide who goes through (change the number or adjust in Heats &amp; lanes).</p>}
              <ol className="final-list">
                {d.standings.map((s, i) => (
                  <li key={s.teamId} className={i < k ? 'in' : ''}>
                    <span className="r mono">{s.rank}</span>
                    <span className="t">{s.team}</span>
                    <span className="p mono">{s.total} pts</span>
                  </li>
                ))}
              </ol>
            </div>
          )
        })}
      </section>

      <section className="card stack">
        <h2>Final heats</h2>
        <div className="grid-2">
          <label className="field"><span>First heat starts</span><input type="time" className="input mono" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="field">
            <span>Lanes</span>
            <select className="input" value={laneMode} onChange={(e) => setLaneMode(e.target.value as 'rank' | 'centre')}>
              <option value="centre">Leader in the middle lane</option>
              <option value="rank">1st in lane 1, 2nd in lane 2…</option>
            </select>
          </label>
          <label className="field"><span>Workout time (min)</span><input className="input mono" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} /></label>
          <label className="field"><span>Changeover (min)</span><input className="input mono" inputMode="numeric" value={changeover} onChange={(e) => setChangeover(e.target.value.replace(/\D/g, ''))} /></label>
        </div>

        <div className="stack-sm">
          <span className="small muted">Heat order (arrows move a division)</span>
          {order.map((id, i) => (
            <div key={id} className="row final-order">
              <span className="lane-move"><span>
                <button type="button" aria-label={`Move ${byId.get(id)?.name} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                <button type="button" aria-label={`Move ${byId.get(id)?.name} later`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>▼</button>
              </span></span>
              <span>{byId.get(id)?.name}</span>
              <span className="small subtle">{n(id) ? `top ${n(id)}` : 'not in the final'}</span>
            </div>
          ))}
        </div>

        {heats.map((h, i) => (
          <div key={i} className="final-heat">
            <div className="spread"><b>Heat {i + 1} · {h.label}</b><span className="mono">{h.start}–{fromMin(toMin(h.start) + (Number(minutes) || 0))}</span></div>
            <table className="table">
              <tbody>
                {h.lanes.map((l) => <tr key={l.lane}><td className="mono" style={{ width: 70 }}>Lane {l.lane}</td><td>{l.team}</td><td className="small muted" style={{ textAlign: 'right' }}>{ordinal(l.rank)}</td></tr>)}
              </tbody>
            </table>
          </div>
        ))}
        {heats.length === 0 && <div className="empty">Pick how many go through in each division.</div>}

        {msg.error && <p className="notice notice-bad">{msg.error}</p>}
        {msg.ok && <p className="notice notice-ok">{msg.ok}</p>}
        <div className="row">
          <button type="button" className="btn" disabled={pending || heats.length === 0} onClick={save}>{pending ? 'Saving…' : existingHeats ? 'Replace final heats' : 'Save final heats'}</button>
          {existingHeats > 0 && <span className="small subtle">The final has {existingHeats} heat{existingHeats > 1 ? 's' : ''} saved already.</span>}
        </div>
      </section>
    </div>
  )
}
