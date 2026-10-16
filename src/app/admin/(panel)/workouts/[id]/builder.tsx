'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { SCORE_TYPES, formatCap, parseCap, partTitle, partTitleOr, type Movement, type ScoreType, type Workout, type WorkoutPart } from '@/lib/types'
import { deleteWorkout, duplicateWorkout, saveWorkout, type WorkoutInput } from '../actions'

type Part = Omit<WorkoutPart, 'part_movements'> & { id: string; capText: string; part_movements: Mv[] }
type Mv = Movement & { id: string }

const uid = () => crypto.randomUUID()
const blankMovement = (): Mv => ({ id: uid(), sort_order: 0, name: '', reps: null, reps_female: null, rx_load: '', scaled_load: '', standards: '', scaled_name: '', scaled_reps: null, scaled_reps_female: null, scaled_standards: '', tap_step: 1 })
const blankPart = (index: number): Part => ({
  id: uid(), label: '', name: '', sort_order: index,
  score_type: 'for_time', direction: 'asc', time_cap_seconds: null, capText: '', rounds: 1, capped_round_rule: 'cap_plus_reps', total_reps: null, unit: '',
  load_entry: 'per_athlete', scored: true, tiebreak_note: '', notes: '', part_movements: [blankMovement()],
})

const HINT: Record<ScoreType, string> = {
  for_time: 'Judges tick each movement as it’s finished. Finish time is the last tick. If capped, the judge enters total reps completed.',
  amrap: 'Judges enter rounds completed plus extra reps.',
  max_reps: 'Judges enter total reps.',
  max_load: 'Each movement below is a lift. Judges enter kg for each lift, and the score is the total.',
  other: 'Judges enter a single number in the unit you choose.',
}

export function Builder({ workout }: { workout: Workout }) {
  const [number, setNumber] = useState(String(workout.number))
  const [name, setName] = useState(workout.name)
  const [description, setDescription] = useState(workout.description ?? '')
  const [combine, setCombine] = useState(workout.combine_parts)
  const [status, setStatus] = useState(workout.status)
  const [parts, setParts] = useState<Part[]>(() =>
    [...(workout.workout_parts ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        ...p,
        id: p.id!,
        capText: p.time_cap_seconds != null ? formatCap(p.time_cap_seconds) : '',
        part_movements: [...p.part_movements].sort((a, b) => a.sort_order - b.sort_order).map((m) => ({ ...m, id: m.id! })),
      }))
  )
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [dirty, setDirty] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, start] = useTransition()

  const touch = () => { setDirty(true); setMsg({}) }
  const updatePart = (id: string, patch: Partial<Part>) => { touch(); setParts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))) }
  const updateMv = (pid: string, mid: string, patch: Partial<Mv>) =>
    updatePart(pid, { part_movements: parts.find((p) => p.id === pid)!.part_movements.map((m) => (m.id === mid ? { ...m, ...patch } : m)) })
  const moveMv = (pid: string, idx: number, dir: -1 | 1) => {
    const list = [...parts.find((p) => p.id === pid)!.part_movements]
    const j = idx + dir
    if (j < 0 || j >= list.length) return
    ;[list[idx], list[j]] = [list[j], list[idx]]
    updatePart(pid, { part_movements: list })
  }

  const scoredParts = parts.filter((p) => p.scored)
  const mixedTypes = new Set(scoredParts.map((p) => p.score_type)).size > 1

  function save() {
    const bad = parts.find((p) => p.capText.trim() && parseCap(p.capText) == null)
    if (bad) { setMsg({ error: `${partTitleOr(bad, parts.indexOf(bad))}: time cap should look like 6:00 or 6.` }); return }
    const input: WorkoutInput = {
      id: workout.id,
      number: Number(number) || workout.number,
      name,
      description,
      combine_parts: combine,
      status,
      parts: parts.map(({ capText, ...p }) => ({ ...p, time_cap_seconds: parseCap(capText) })),
    }
    start(async () => {
      const res = await saveWorkout(input)
      if (res.error) setMsg({ error: res.error })
      else { setMsg({ ok: 'Saved' }); setDirty(false) }
    })
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="spread">
        <div className="stack-sm">
          <Link href="/admin/workouts" className="small">← All workouts</Link>
          <h1>Event {number || '?'} · {name || 'Untitled'}</h1>
        </div>
        <div className="row">
          {msg.ok && !dirty && <span className="pill pill-ok">{msg.ok}</span>}
          {dirty && <span className="small subtle">Unsaved changes</span>}
          <button className="btn" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save workout'}</button>
        </div>
      </div>
      {msg.error && <p className="notice notice-bad">{msg.error}</p>}

      <div className="card stack">
        <div className="grid-4" style={{ gridTemplateColumns: '90px minmax(0,2fr) minmax(0,1fr)' }}>
          <label className="field"><span>Event #</span><input id="w-number" className="input" inputMode="numeric" value={number} onChange={(e) => { touch(); setNumber(e.target.value.replace(/\D/g, '')) }} /></label>
          <label className="field"><span>Workout name</span><input id="w-name" className="input" value={name} onChange={(e) => { touch(); setName(e.target.value) }} /></label>
          <label className="field">
            <span>Status</span>
            <select id="w-status" className="input" value={status} onChange={(e) => { touch(); setStatus(e.target.value as Workout['status']) }}>
              <option value="draft">Draft</option>
              <option value="ready">Ready (judges can see it)</option>
              <option value="live">Live</option>
              <option value="complete">Complete</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Description (shown to athletes and judges)</span>
          <textarea id="w-desc" className="input" value={description} onChange={(e) => { touch(); setDescription(e.target.value) }} placeholder="e.g. Pairs, split reps any way. Part A then Part B with 2 minutes rest." />
        </label>
      </div>

      {parts.map((p, pi) => (
        <section key={p.id} className="part">
          <div className="part-head">
            <div className="row">
              <span className="part-label">Part</span>
              <input aria-label="Part letter (optional)" placeholder="–" title="Optional letter, e.g. A. Leave blank for no letter." className="input" style={{ width: 54, fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: '1.1rem', textAlign: 'center' }} value={p.label} onChange={(e) => updatePart(p.id, { label: e.target.value.toUpperCase().slice(0, 3) })} />
              <input aria-label="Part name" className="input" style={{ width: 240 }} placeholder="Name (optional), e.g. Engine" value={p.name} onChange={(e) => updatePart(p.id, { name: e.target.value })} />
            </div>
            <div className="row">
              <label className="check"><input type="checkbox" checked={p.scored} onChange={(e) => updatePart(p.id, { scored: e.target.checked })} />Scored on leaderboard</label>
              {parts.length > 1 && <button className="linkbtn danger" onClick={() => { touch(); setParts((ps) => ps.filter((x) => x.id !== p.id)) }}>Remove part</button>}
            </div>
          </div>

          <div className="grid-2" style={{ gap: 14 }}>
            <div className="field">
              <span>Score type</span>
              <div className="seg">
                {SCORE_TYPES.map((t) => (
                  <button key={t.value} type="button" aria-pressed={p.score_type === t.value}
                    onClick={() => updatePart(p.id, { score_type: t.value, direction: t.defaultDirection })}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Winner is</span>
              <div className="seg">
                <button type="button" aria-pressed={p.direction === 'asc'} onClick={() => updatePart(p.id, { direction: 'asc' })}>Lowest ▼</button>
                <button type="button" aria-pressed={p.direction === 'desc'} onClick={() => updatePart(p.id, { direction: 'desc' })}>Highest ▲</button>
              </div>
            </div>
          </div>
          <p className="small subtle">{HINT[p.score_type]}</p>
          {p.score_type === 'for_time' && p.rounds > 1 && (
            <div className="notice stack-sm">
              <span>
                <b style={{ color: 'var(--text)' }}>{p.rounds} rounds × {p.capText || '?'} window.</b> Each round is timed on its own and the score is the
                {' '}<b style={{ color: 'var(--text)' }}>total of the {p.rounds} round times</b>, {p.direction === 'asc' ? 'lowest' : 'highest'} wins.
              </span>
              <div className="row">
                <span className="small subtle">A round not finished in the window counts as:</span>
                <div className="seg">
                  <button type="button" aria-pressed={p.capped_round_rule === 'cap_plus_reps'} onClick={() => updatePart(p.id, { capped_round_rule: 'cap_plus_reps' })}>Window time + 1 s per rep missed</button>
                  <button type="button" aria-pressed={p.capped_round_rule === 'cap_only'} onClick={() => updatePart(p.id, { capped_round_rule: 'cap_only' })}>Window time only</button>
                </div>
              </div>
            </div>
          )}

          <div className="grid-4">
            <label className="field">
              <span>{p.score_type === 'for_time' ? (p.rounds > 1 ? 'Window per round' : 'Time cap') : 'Time window'} (mm:ss)</span>
              <input className="input mono" placeholder="6:00" value={p.capText} onChange={(e) => updatePart(p.id, { capText: e.target.value })} />
            </label>
            {p.score_type === 'for_time' && (
              <label className="field">
                <span>Timed rounds</span>
                <input className="input mono" inputMode="numeric" value={p.rounds}
                  onChange={(e) => updatePart(p.id, { rounds: Math.max(1, Math.min(20, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
              </label>
            )}
            {p.score_type === 'for_time' && (
              <label className="field">
                <span>{p.rounds > 1 ? 'Reps per round (M)' : 'Total reps in workout'}</span>
                <input className="input mono" inputMode="numeric"
                  placeholder={String(p.part_movements.reduce((n, m) => n + (m.reps ?? 0), 0) || '')}
                  value={p.total_reps ?? ''} onChange={(e) => updatePart(p.id, { total_reps: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} />
              </label>
            )}
            {p.score_type === 'max_load' && (
              <div className="field">
                <span>Load entered</span>
                <div className="seg">
                  <button type="button" aria-pressed={p.load_entry === 'per_athlete'} onClick={() => updatePart(p.id, { load_entry: 'per_athlete' })}>Per athlete</button>
                  <button type="button" aria-pressed={p.load_entry === 'per_team'} onClick={() => updatePart(p.id, { load_entry: 'per_team' })}>Per pair</button>
                </div>
              </div>
            )}
            {p.score_type === 'other' && (
              <label className="field"><span>Unit</span><input className="input" placeholder="m, cal, kg…" value={p.unit ?? ''} onChange={(e) => updatePart(p.id, { unit: e.target.value })} /></label>
            )}
            <label className="field" style={{ gridColumn: 'span 2' }}>
              <span>Tiebreak</span>
              <input className="input" placeholder={p.score_type === 'max_load' ? 'e.g. heaviest single clean' : 'e.g. time at end of toes-to-bar'} value={p.tiebreak_note ?? ''} onChange={(e) => updatePart(p.id, { tiebreak_note: e.target.value })} />
            </label>
          </div>

          <div className="stack-sm">
            <span className="lbl" style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--subtle)' }}>
              {p.score_type === 'max_load' ? 'Lifts' : 'Movements'}
            </span>
            <div className="table-wrap">
              <div className="mv-grid" style={{ minWidth: 860 }}>
                <span></span><span></span><span className="h">Movement</span><span className="h">Reps M / F · Tap</span><span className="h">Load (M/F)</span><span className="h">Standards</span><span></span>
                {p.part_movements.map((m, mi) => {
                  const num = (v: string) => (v ? Number(v.replace(/\D/g, '')) : null)
                  return (
                    <Row key={m.id}>
                      {mi > 0 && <span className="mv-sep" />}
                      {/* RX */}
                      <span className="n">
                        <button className="linkbtn" aria-label="Move up" onClick={() => moveMv(p.id, mi, -1)} disabled={mi === 0} style={{ display: 'block', margin: '0 auto' }}>▲</button>
                        <button className="linkbtn" aria-label="Move down" onClick={() => moveMv(p.id, mi, 1)} disabled={mi === p.part_movements.length - 1} style={{ display: 'block', margin: '0 auto' }}>▼</button>
                      </span>
                      <span className="mv-tag rx">RX</span>
                      <input className="input" aria-label="RX movement" placeholder={p.score_type === 'max_load' ? '1RM clean' : 'Pull-ups'} value={m.name} onChange={(e) => updateMv(p.id, m.id, { name: e.target.value })} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: 4 }}>
                        <input className="input mono" aria-label="RX reps (male)" inputMode="numeric" value={m.reps ?? ''} onChange={(e) => updateMv(p.id, m.id, { reps: num(e.target.value) })} />
                        <input className="input mono" aria-label="RX reps (female)" inputMode="numeric" placeholder={m.reps != null ? String(m.reps) : ''} value={m.reps_female ?? ''} onChange={(e) => updateMv(p.id, m.id, { reps_female: num(e.target.value) })} />
                        {/* reps counted by one tap of the judge's + button (e.g. 3 for 21 cal row) */}
                        <input className="input mono" aria-label="Reps per judge tap" title="Reps per judge tap" placeholder="1" inputMode="numeric" value={m.tap_step && m.tap_step !== 1 ? m.tap_step : ''} onChange={(e) => updateMv(p.id, m.id, { tap_step: num(e.target.value) ?? 1 })} />
                      </div>
                      <input className="input" aria-label="RX load" placeholder="60/40kg" value={m.rx_load ?? ''} onChange={(e) => updateMv(p.id, m.id, { rx_load: e.target.value })} />
                      <textarea className="input" aria-label="RX standards" rows={1} placeholder="What counts as a good rep" value={m.standards ?? ''} onChange={(e) => updateMv(p.id, m.id, { standards: e.target.value })} />
                      <button className="linkbtn danger" aria-label="Remove movement" style={{ paddingTop: 8 }} onClick={() => updatePart(p.id, { part_movements: p.part_movements.filter((x) => x.id !== m.id) })}>✕</button>
                      {/* Scaled: blank = same as RX */}
                      <span></span>
                      <span className="mv-tag sc">Scaled</span>
                      <input className="input" aria-label="Scaled movement" placeholder={m.name ? `${m.name} (same)` : 'Same as RX'} value={m.scaled_name ?? ''} onChange={(e) => updateMv(p.id, m.id, { scaled_name: e.target.value })} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: 4 }}>
                        <input className="input mono" aria-label="Scaled reps (male)" inputMode="numeric" placeholder={m.reps != null ? String(m.reps) : ''} value={m.scaled_reps ?? ''} onChange={(e) => updateMv(p.id, m.id, { scaled_reps: num(e.target.value) })} />
                        <input className="input mono" aria-label="Scaled reps (female)" inputMode="numeric" placeholder={String(m.scaled_reps ?? m.reps_female ?? m.reps ?? '')} value={m.scaled_reps_female ?? ''} onChange={(e) => updateMv(p.id, m.id, { scaled_reps_female: num(e.target.value) })} />
                        <span></span>
                      </div>
                      <input className="input" aria-label="Scaled load" placeholder={m.rx_load ? `${m.rx_load} (same)` : '40/30kg'} value={m.scaled_load ?? ''} onChange={(e) => updateMv(p.id, m.id, { scaled_load: e.target.value })} />
                      <textarea className="input" aria-label="Scaled standards" rows={1} placeholder="Same as RX" value={m.scaled_standards ?? ''} onChange={(e) => updateMv(p.id, m.id, { scaled_standards: e.target.value })} />
                      <span></span>
                    </Row>
                  )
                })}
              </div>
            </div>
            <div>
              <button className="btn btn-ghost btn-sm" onClick={() => updatePart(p.id, { part_movements: [...p.part_movements, blankMovement()] })}>
                + Add {p.score_type === 'max_load' ? 'lift' : 'movement'}
              </button>
            </div>
          </div>

          <label className="field">
            <span>Judge notes{partTitle(p) ? ` for ${partTitle(p)}` : ''}</span>
            <textarea className="input" value={p.notes ?? ''} onChange={(e) => updatePart(p.id, { notes: e.target.value })} placeholder="Anything judges need to know: equipment, start position, rest between parts" />
          </label>
          
        </section>
      ))}

      <div className="row">
        <button className="btn btn-ghost" onClick={() => { touch(); setParts((ps) => [...ps, blankPart(ps.length)]) }}>+ Add part</button>
      </div>

      {parts.length > 1 && (
        <div className="card stack-sm">
          <h3>How the parts count on the leaderboard</h3>
          <div className="seg">
            <button type="button" aria-pressed={!combine} onClick={() => { touch(); setCombine(false) }}>Each scored part gets its own placing</button>
            <button type="button" aria-pressed={combine} onClick={() => { touch(); setCombine(true) }}>Combine scored parts into one placing</button>
          </div>
          <p className="small subtle">
            {combine
              ? `Scores from ${scoredParts.map((p) => partTitleOr(p, parts.indexOf(p))).join(' + ') || 'scored parts'} are added together into one placing.`
              : `${scoredParts.length} placing${scoredParts.length === 1 ? '' : 's'} on the leaderboard: ${scoredParts.map((p, i) => `Event ${number}${scoredParts.length > 1 ? (p.label.trim() || `.${i + 1}`) : ''}`).join(', ') || 'none'}.`}
            {' '}Untick “Scored on leaderboard” to make a part a buy-in.
          </p>
          {combine && mixedTypes && <p className="notice notice-bad">The scored parts have different score types, so they can’t be added together. Use separate placings, or make them the same type.</p>}
        </div>
      )}

      <div className="spread" style={{ alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <div className="row">
          <button className="btn" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save workout'}</button>
          <button className="btn btn-ghost" onClick={() => start(() => duplicateWorkout(workout.id))} disabled={pending}>Duplicate</button>
        </div>
        {confirmDelete ? (
          <div className="row">
            <span className="small muted">Delete this workout?</span>
            <button className="btn btn-danger btn-sm" onClick={() => start(() => deleteWorkout(workout.id))}>Yes, delete</button>
            <button className="linkbtn" onClick={() => setConfirmDelete(false)}>Keep</button>
          </div>
        ) : (
          <button className="linkbtn danger" onClick={() => setConfirmDelete(true)}>Delete workout</button>
        )}
      </div>
    </div>
  )
}

// Fragment wrapper keeps each movement's cells inside the shared grid.
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
