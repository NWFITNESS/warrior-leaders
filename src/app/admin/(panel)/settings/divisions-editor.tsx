'use client'

import { useState, useTransition } from 'react'
import { saveDivisions, type DivisionInput } from './actions'

export function DivisionsEditor({ initial }: { initial: (DivisionInput & { teams: number })[] }) {
  const [rows, setRows] = useState(initial)
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string }>({})
  const [pending, start] = useTransition()
  const set = (i: number, patch: Partial<DivisionInput>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i: number, d: -1 | 1) => setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n })
  return (
    <section className="card stack">
      <h2>Divisions</h2>
      <p className="small subtle">The leaderboard has a tab for each, in this order. Scaled divisions see the scaled version of every movement.</p>
      <div className="stack-sm">
        {rows.map((d, i) => (
          <div key={d.id ?? `new-${i}`} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '2 1 180px' }} aria-label="Division name" value={d.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="e.g. RX Male" />
            <select className="input" style={{ flex: '1 1 110px' }} aria-label="Level" value={d.level} onChange={(e) => set(i, { level: e.target.value as DivisionInput['level'] })}>
              <option value="rx">RX</option><option value="scaled">Scaled</option>
            </select>
            <select className="input" style={{ flex: '1 1 110px' }} aria-label="Who" value={d.sex} onChange={(e) => set(i, { sex: e.target.value as DivisionInput['sex'] })}>
              <option value="male">Male</option><option value="female">Female</option><option value="mixed">Mixed</option>
            </select>
            <span className="small subtle" style={{ minWidth: 64 }}>{d.teams} team{d.teams === 1 ? '' : 's'}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={d.teams > 0} title={d.teams > 0 ? 'Has teams' : 'Remove'} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((r) => [...r, { name: '', level: 'rx', sex: 'male', teams: 0 }])}>+ Add division</button>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => setMsg(await saveDivisions(rows.map(({ teams: _t, ...d }) => d))))}>
          {pending ? 'Saving…' : 'Save divisions'}
        </button>
      </div>
      {msg.error && <p className="notice notice-bad">{msg.error}</p>}
      {msg.ok && <p className="notice notice-ok">Divisions saved.</p>}
    </section>
  )
}
