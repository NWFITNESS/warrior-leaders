'use client'

import { useActionState, useState } from 'react'
import type { PointsMethod, Settings } from '@/lib/types'
import { pointsFor } from '@/lib/points'
import { saveSettings } from './actions'

const METHODS: { value: PointsMethod; title: string; body: string; wins: string }[] = [
  { value: 'placing', title: 'Placing points', body: '1st = 1 point, 2nd = 2, 3rd = 3… Add them up across events.', wins: 'Lowest total wins' },
  { value: 'reverse', title: 'Reverse placing', body: '1st gets as many points as there are pairs in the division, last gets 1.', wins: 'Highest total wins' },
  { value: 'custom', title: 'Custom table', body: 'Type your own points for each place, e.g. 100, 95, 90…', wins: 'Highest total wins' },
]

const SAMPLE = [
  { team: 'Iron & Oak', places: [2, 1, 3] },
  { team: 'Barbell Bandits', places: [1, 3, 2] },
  { team: 'Northern Lights', places: [4, 2, 1] },
  { team: 'Wall Ball Wizards', places: [3, 4, 4] },
]

export function SettingsForm({ settings, largestDivision }: { settings: Settings; largestDivision: number }) {
  const [state, action, pending] = useActionState(saveSettings, {})
  const [method, setMethod] = useState<PointsMethod>(settings.points_method)
  const [custom, setCustom] = useState(settings.custom_points.join(', '))

  const customList = custom.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite)
  const divisionSize = Math.max(largestDivision, SAMPLE.length)
  const preview = SAMPLE.map((s) => ({
    ...s,
    pts: s.places.map((p) => pointsFor(method, p, divisionSize, customList)),
  })).map((s) => ({ ...s, total: s.pts.reduce((a, b) => a + b, 0) }))
  preview.sort((a, b) => (method === 'placing' ? a.total - b.total : b.total - a.total))

  return (
    <form action={action} className="stack" style={{ gap: 20 }}>
      <section className="card stack">
        <h2>Competition</h2>
        <div className="grid-3">
          <label className="field"><span>Name</span><input id="s-name" name="name" className="input" defaultValue={settings.name} /></label>
          <label className="field"><span>Date</span><input id="s-date" name="event_date" type="date" className="input" defaultValue={settings.event_date} /></label>
          <label className="field"><span>Venue</span><input id="s-venue" name="venue" className="input" defaultValue={settings.venue} /></label>
        </div>
      </section>

      <section className="card stack">
        <h2>Leaderboard points</h2>
        <input type="hidden" name="points_method" value={method} />
        <div className="grid-3">
          {METHODS.map((m) => (
            <button key={m.value} type="button" onClick={() => setMethod(m.value)} aria-pressed={method === m.value}
              className="card stack-sm"
              style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'var(--muted)', fontSize: '0.86rem', borderColor: method === m.value ? 'var(--gold)' : 'var(--line-2)', background: method === m.value ? 'rgba(150,119,5,0.08)' : 'transparent' }}>
              <b style={{ fontFamily: 'var(--f-display)', fontSize: '1.2rem', color: 'var(--text)' }}>{m.title}</b>
              <span>{m.body}</span>
              <span style={{ color: 'var(--gold-hi)', fontWeight: 600 }}>{m.wins}</span>
            </button>
          ))}
        </div>
        {method === 'custom' && (
          <label className="field">
            <span>Points for 1st, 2nd, 3rd… (places beyond the list get 0)</span>
            <input id="s-custom" name="custom_points" className="input mono" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="100, 95, 90, 85, 80" />
          </label>
        )}
        {method !== 'custom' && <input type="hidden" name="custom_points" value={custom} />}

        <div className="grid-2">
          <div className="stack-sm">
            <span className="eyebrow">Preview · example pairs after 3 events</span>
            <table className="table">
              <thead><tr><th>Pair</th><th>E1</th><th>E2</th><th>E3</th><th>Total</th><th>Rank</th></tr></thead>
              <tbody>
                {preview.map((s, i) => (
                  <tr key={s.team}>
                    <td>{s.team}</td>
                    {s.pts.map((p, j) => <td key={j} className="mono">{p}<span className="subtle small"> ({ordinal(s.places[j])})</span></td>)}
                    <td className="mono" style={{ fontWeight: 700 }}>{s.total}</td>
                    <td>{ordinal(i + 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stack-sm">
            <label className="field">
              <span>Overall tiebreak</span>
              <input id="s-tiebreak" name="overall_tiebreak" className="input" defaultValue={settings.overall_tiebreak} />
            </label>
            <p className="small subtle">Pairs tied within an event share the same place and the same points.</p>
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2>Floor and judges</h2>
        <div className="grid-3">
          <label className="field"><span>Lanes per heat</span><input id="s-lanes" name="lanes_per_heat" type="number" min={1} max={30} className="input mono" defaultValue={settings.lanes_per_heat} /></label>
          <label className="field">
            <span>Judge code for the day (4 digits)</span>
            <input id="s-code" name="judge_code" inputMode="numeric" maxLength={4} className="input mono" defaultValue={settings.judge_code} style={{ fontSize: '1.2rem', letterSpacing: '0.3em' }} />
          </label>
        </div>
        <p className="small subtle">Give the code out at the judges’ briefing. Changing it signs every judge out at their next action.</p>
      </section>

      {state.error && <p className="notice notice-bad">{state.error}</p>}
      {state.ok && <p className="notice notice-ok">Settings saved.</p>}
      <div><button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  )
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
