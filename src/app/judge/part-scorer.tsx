'use client'

import { useEffect, useRef, useState } from 'react'
import { getDraft, putDraft, queue, type Draft, type JudgeEvent, type JudgePart, type Lane } from '@/lib/judge-client'
import {
  amrapPosition, amrapTap, computeScore, forTimeTap, emptyEntries, formatTime, loadComplete, repsFor, repsPerRound, roundValue, tapStep,
  type Entries, type ForTimeEntries, type LoadEntries, type RoundEntry, type Sex,
} from '@/lib/scoring'
import { parseCap, partTitle, resolvePart } from '@/lib/types'

const ev = (kind: string, payload: Record<string, unknown> = {}): JudgeEvent => ({ kind, payload, at: new Date().toISOString() })

function initialDraft(lane: Lane, part: JudgePart): Draft {
  const local = getDraft(lane.lane_assignment_id, part.id)
  const server = lane.scores.find((s) => s.part_id === part.id)
  const serverEntries = server?.entries && 'kind' in server.entries ? (server.entries as Entries) : null
  const serverStatus = server?.status === 'submitted' || server?.status === 'appeal' || server?.status === 'verified' ? 'submitted' : 'draft'
  const locked = server?.status === 'verified' || server?.status === 'rejected' ? server.status : undefined
  // the phone's copy wins if it's newer than what the server has (e.g. saved while offline)
  if (local && (!server || local.updatedAt >= Date.parse(server.updated_at))) return { ...local, locked: locked ?? local.locked }
  if (serverEntries) return { entries: serverEntries, tiebreak: '', signed_by: server?.signed_by ?? '', status: serverStatus, updatedAt: Date.parse(server!.updated_at), locked }
  return { entries: emptyEntries(part), tiebreak: '', signed_by: '', status: 'draft', updatedAt: 0, locked }
}

export function PartScorer({ lane, part: rawPart }: { lane: Lane; part: JudgePart }) {
  // Scaled teams see (and are scored on) the Scaled version of each movement
  const part = resolvePart(rawPart, lane.team.level)
  const sex: Sex = lane.team.sex
  const [draft, setDraft] = useState<Draft>(() => initialDraft(lane, part))
  const draftRef = useRef(draft)
  draftRef.current = draft

  const athleteIds = lane.team.athletes.map((a) => a.id)
  const result = computeScore(part, sex, draft.entries)
  const complete = draft.entries.kind === 'max_load' ? loadComplete(part, athleteIds, draft.entries) : result.complete
  const locked = !!draft.locked
  const submitted = draft.status === 'submitted'

  function commit(next: Partial<Draft>, events: JudgeEvent[] = [], status: Draft['status'] = 'draft') {
    const d: Draft = { ...draftRef.current, ...next, status, updatedAt: Date.now() }
    draftRef.current = d
    setDraft(d)
    putDraft(lane.lane_assignment_id, part.id, d)
    const r = computeScore(part, sex, d.entries)
    const tb = d.tiebreak.trim() ? parseCap(d.tiebreak) ?? Number(d.tiebreak) : null
    queue({
      lane: lane.lane_assignment_id,
      part: part.id,
      score: {
        status,
        value: r.value,
        capped: r.capped,
        reps: d.entries.kind === 'amrap' ? d.entries.reps : d.entries.kind === 'max_reps' ? d.entries.reps : null,
        rounds: d.entries.kind === 'amrap' ? d.entries.rounds : null,
        tiebreak_value: tb != null && Number.isFinite(tb) ? tb : null,
        entries: d.entries,
        splits: d.entries.kind === 'for_time' ? d.entries.rounds.flatMap((rd, i) => rd.ticks.map((t) => ({ round: i + 1, ...t }))) : [],
        signed_by: d.signed_by || null,
      },
      events,
    })
  }
  const setEntries = (entries: Entries, events: JudgeEvent[] = []) => commit({ entries }, events)
  // taps build on the latest saved entries, so quick double taps are never lost to a stale render
  const tapEntries = (fn: (e: Entries) => { entries: Entries; events?: JudgeEvent[] } | null) => {
    const r = fn(draftRef.current.entries)
    if (r) commit({ entries: r.entries }, r.events ?? [])
  }

  const loadFor = (m: JudgePart['part_movements'][number]) => m.rx_load // already the team's version (resolvePart)

  return (
    <div className="stack" style={{ gap: 14 }}>
      {part.notes && <p className="notice">{part.notes}</p>}
      {!part.scored && <p className="notice">{partTitle(part) ?? 'This part'} is a buy-in and isn’t scored on the leaderboard. Record it anyway so the head judge has it.</p>}
      {locked && <p className="notice notice-ok">This score has been {draft.locked} by the head judge and can’t be changed here.</p>}

      <fieldset disabled={locked || submitted} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="stack">
        {draft.entries.kind === 'for_time' && (
          <ForTime part={part} sex={sex} entries={draft.entries} loadFor={loadFor} onChange={setEntries}
            onTap={(dir) => tapEntries((e) => { if (e.kind !== 'for_time') return null; const t = forTimeTap(part, sex, e, dir, Date.now()); return t && { entries: t.entries, events: t.tick ? [ev('tick', { ...t.tick, via: 'tap' })] : [] } })} />
        )}
        {draft.entries.kind === 'amrap' && (
          <Amrap part={part} sex={sex} loadFor={loadFor} entries={draft.entries} onChange={setEntries}
            onTap={(dir) => tapEntries((e) => e.kind === 'amrap' ? { entries: { kind: 'amrap', ...amrapTap(part, sex, e.rounds ?? 0, e.reps ?? 0, dir) } } : null)} />
        )}
        {draft.entries.kind === 'max_reps' && (
          <>
            <MovementList part={part} sex={sex} loadFor={loadFor} />
            <CapClock part={part} />
            <TapPad what="Total reps" count={draft.entries.reps ?? 0} step={tapStep(part.part_movements[0])}
              onTap={(dir) => tapEntries((e) => e.kind === 'max_reps' ? { entries: { kind: 'max_reps', reps: Math.max(0, (e.reps ?? 0) + dir * tapStep(part.part_movements[0])) } } : null)} />
            <Stepper label="Total reps" value={draft.entries.reps} onChange={(v) => setEntries({ kind: 'max_reps', reps: v }, [ev('input', { reps: v })])} />
          </>
        )}
        {draft.entries.kind === 'max_load' && (
          <MaxLoad part={part} lane={lane} loadFor={loadFor} entries={draft.entries} onChange={setEntries} />
        )}
        {draft.entries.kind === 'other' && (
          <>
            <MovementList part={part} sex={sex} loadFor={loadFor} />
            <label className="field">
              <span>Score{part.unit ? ` (${part.unit})` : ''}</span>
              <DecimalInput className="input j-code" style={{ letterSpacing: 0, padding: 12 }} label="Score" value={draft.entries.value}
                onChange={(v) => { const n = v.trim() === '' ? null : Number(v); setEntries({ kind: 'other', value: n != null && Number.isFinite(n) ? n : null }, [ev('input', { value: v })]) }} />
            </label>
          </>
        )}

        {part.tiebreak_note && (
          <label className="field">
            <span>Tiebreak · {part.tiebreak_note}</span>
            <input className="input mono" style={{ fontSize: '1.3rem', padding: 12 }} inputMode="decimal" placeholder={part.score_type === 'max_load' ? 'kg' : 'mm:ss'}
              value={draft.tiebreak} onChange={(e) => commit({ tiebreak: e.target.value }, [ev('tiebreak', { value: e.target.value })])} />
          </label>
        )}
      </fieldset>

      <section className="card stack" style={{ borderColor: complete ? 'var(--gold)' : 'var(--line)' }}>
        <div className="j-result">
          <small>{part.score_type === 'for_time' && part.rounds > 1 ? `Total of ${part.rounds} rounds` : 'Score'}</small>
          <b>{result.display}</b>
          {result.detail.length > 0 && <span className="small subtle">{result.detail.join(' · ')}</span>}
        </div>

        {submitted ? (
          <div className="stack-sm" style={{ textAlign: 'center' }}>
            <span className={`pill ${locked ? 'pill-ok' : 'pill-gold'}`} style={{ justifySelf: 'center' }}>
              {locked ? `${draft.locked === 'verified' ? 'Verified' : 'Rejected'} by head judge` : 'Submitted · waiting for the head judge'}
            </span>
            {draft.signed_by && <span className="small subtle">Agreed by {draft.signed_by}</span>}
            {!locked && <button className="btn btn-ghost" onClick={() => commit({}, [ev('reopen')], 'draft')}>Edit this score</button>}
          </div>
        ) : (
          <SubmitPanel lane={lane} complete={complete} signedBy={draft.signed_by}
            onSign={(name) => commit({ signed_by: name }, [ev('captain', { name })])}
            onSubmit={() => commit({}, [ev('submit', { value: result.value, display: result.display })], 'submitted')} />
        )}
      </section>
    </div>
  )
}

// ── For time (single or timed rounds) ──────────────────────────────────────────
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

function ForTime({ part, sex, entries, loadFor, onChange, onTap }: {
  part: JudgePart; sex: Sex; entries: ForTimeEntries; loadFor: (m: JudgePart['part_movements'][number]) => string | null
  onChange: (e: Entries, events?: JudgeEvent[]) => void; onTap: (dir: 1 | -1) => void
}) {
  const movements = part.part_movements
  const cap = part.time_cap_seconds
  const multi = entries.rounds.length > 1
  // the current round: first one not finished (a capped round still needs its partial reps)
  const idx = entries.rounds.findIndex((r) => !(movements.length && r.ticks.length >= movements.length) && !(r.capped && r.partial_reps != null && r.confirmed))
  const ri = idx === -1 ? entries.rounds.length : idx
  const round: RoundEntry | undefined = entries.rounds[ri]
  const running = !!round?.started_at && !round.capped && round.ticks.length < movements.length
  const now = useNow(running)
  const elapsed = round?.started_at ? (now - round.started_at) / 1000 : 0
  const [confirmReset, setConfirmReset] = useState(false)

  const update = (r: RoundEntry, events: JudgeEvent[]) =>
    onChange({ kind: 'for_time', rounds: entries.rounds.map((x, i) => (i === ri ? r : x)) }, events)
  // time's up: reps already tapped on the current movement pre-fill the partial reps
  const capRound = (r: RoundEntry): RoundEntry => {
    const m = movements[r.ticks.length]
    const max = Math.max(0, repsFor(m ?? { reps: 0, reps_female: null }, sex) - 1)
    return { ...r, capped: true, partial_reps: r.partial_reps ?? (r.reps_done ? Math.min(r.reps_done, max) : null) }
  }


  // window ran out with movements left: mark the round capped
  useEffect(() => {
    if (running && cap != null && elapsed >= cap) {
      update(capRound(round!), [ev('cap', { round: ri + 1, auto: true, at_seconds: cap })])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, elapsed >= (cap ?? Infinity)])

  const chips = multi && (
    <div className="j-rounds">
      {entries.rounds.map((r, i) => {
        const v = roundValue(part, sex, r)
        const finished = i < ri
        return <span key={i} className={i === ri ? 'on' : finished ? 'done' : ''}>R{i + 1}<b>{finished && v.value != null ? formatTime(v.value) : '—'}</b></span>
      })}
    </div>
  )

  if (!round) {
    return (
      <>
        {chips}
        <p className="notice notice-ok">All {multi ? `${entries.rounds.length} rounds` : 'movements'} recorded. Check the score below with the captain.</p>
        <button type="button" className="linkbtn" onClick={() => { const last = entries.rounds.length - 1; onChange({ kind: 'for_time', rounds: entries.rounds.map((r, i) => (i === last ? { started_at: null, ticks: [], capped: false, partial_reps: null } : r)) }, [ev('reset_round', { round: last + 1 })]) }}>
          Redo the last {multi ? 'round' : 'attempt'}
        </button>
      </>
    )
  }

  const nextMv = round.ticks.length
  const remaining = cap != null ? cap - elapsed : null
  const label = multi ? `Round ${ri + 1} of ${entries.rounds.length}` : 'Time'

  return (
    <>
      {chips}
      <div className={`j-clock${remaining != null && remaining <= 10 && running ? ' over' : ''}`}>
        {formatTime(round.capped ? cap : elapsed)}
        <small>{label}{cap != null ? ` · ${multi ? 'window' : 'cap'} ${formatTime(cap, false)}` : ''}{running && remaining != null ? ` · ${formatTime(Math.max(0, remaining), false)} left` : ''}</small>
      </div>

      {!round.started_at && (
        <button type="button" className="btn j-big" onClick={() => update({ ...round, started_at: Date.now() }, [ev('start', { round: ri + 1 })])}>
          {multi ? `Start round ${ri + 1}` : 'Start clock'}
        </button>
      )}

      <div className="stack-sm">
        {movements.map((m, i) => {
          const tick = round.ticks.find((t) => t.movement_id === m.id)
          const cur = !!round.started_at && !round.capped && i === nextMv
          const load = loadFor(m)
          return (
            <div key={m.id} className={`j-mv${cur ? ' cur' : ''}${tick ? ' done' : ''}`}>
              <div>
                <div className="nm">{repsFor(m, sex) || ''} {m.name}{load ? ` · ${load}` : ''}</div>
                {m.standards && (cur || !round.started_at) && <div className="std">{m.standards}</div>}
              </div>
              <button type="button" className="j-tick" disabled={!cur} aria-label={`Tick ${m.name}`}
                onClick={() => update({ ...round, reps_done: 0, ticks: [...round.ticks, { movement_id: m.id!, at: Math.round(elapsed * 10) / 10 }] }, [ev('tick', { round: ri + 1, movement_id: m.id, movement: m.name, at_seconds: Math.round(elapsed * 10) / 10 })])}>
                {tick ? formatTime(tick.at) : '✓'}
              </button>
              {cur && repsFor(m, sex) > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <TapPad what={m.name} count={round.reps_done ?? 0} need={repsFor(m, sex)} step={tapStep(m)} onTap={onTap} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {round.capped && (
        <div className="card stack-sm" style={{ borderColor: 'var(--warn)' }}>
          <b>Time’s up{multi ? ` on round ${ri + 1}` : ''}.</b>
          <span className="small muted">How many {movements[nextMv]?.name ?? 'reps'} reps did they get?</span>
          <Stepper label="" value={round.partial_reps} max={Math.max(0, repsFor(movements[nextMv] ?? { reps: 0, reps_female: null }, sex) - 1)}
            onChange={(v) => update({ ...round, partial_reps: v }, [ev('partial_reps', { round: ri + 1, reps: v })])} />
          <button type="button" className="btn" disabled={round.partial_reps == null}
            onClick={() => update({ ...round, partial_reps: round.partial_reps ?? 0, confirmed: true }, [ev('round_capped_done', { round: ri + 1, reps: round.partial_reps })])}>
            {round.partial_reps == null ? 'Enter reps above' : multi && ri < entries.rounds.length - 1 ? 'Save and go to next round' : 'Save'}
          </button>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!round.ticks.length || round.capped}
          onClick={() => update({ ...round, reps_done: 0, ticks: round.ticks.slice(0, -1) }, [ev('untick', { round: ri + 1, movement_id: round.ticks.at(-1)?.movement_id })])}>
          Undo last tick
        </button>
        {running && cap != null && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => update(capRound(round), [ev('cap', { round: ri + 1, auto: false, at_seconds: Math.round(elapsed * 10) / 10 })])}>
            Time’s up
          </button>
        )}
        {round.started_at && (
          confirmReset ? (
            <span className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => { setConfirmReset(false); update({ started_at: null, ticks: [], capped: false, partial_reps: null, confirmed: false, reps_done: 0 }, [ev('reset_round', { round: ri + 1 })]) }}>Restart round</button>
              <button type="button" className="linkbtn" onClick={() => setConfirmReset(false)}>Keep</button>
            </span>
          ) : (
            <button type="button" className="linkbtn danger" onClick={() => setConfirmReset(true)}>Restart{multi ? ' round' : ''}</button>
          )
        )}
      </div>
    </>
  )
}

// ── AMRAP ──────────────────────────────────────────────────────────────────────
function Amrap({ part, sex, loadFor, entries, onChange, onTap }: {
  part: JudgePart; sex: Sex; loadFor: (m: JudgePart['part_movements'][number]) => string | null
  entries: Extract<Entries, { kind: 'amrap' }>; onChange: (e: Entries, events?: JudgeEvent[]) => void; onTap: (dir: 1 | -1) => void
}) {
  return (
    <>
      <MovementList part={part} sex={sex} loadFor={loadFor} />
      <CapClock part={part} />
      {repsPerRound(part, sex) > 0 && (() => {
        const pos = amrapPosition(part, sex, entries.reps ?? 0)
        return (
          <TapPad what={pos ? `Round ${(entries.rounds ?? 0) + 1} · ${pos.movement.name}` : 'Reps'} count={pos?.done ?? 0} need={pos?.need} step={tapStep(pos?.movement)}
            onTap={onTap} />
        )
      })()}
      <Stepper label="Full rounds" value={entries.rounds} onChange={(v) => onChange({ ...entries, rounds: v }, [ev('input', { rounds: v })])} />
      <Stepper label="Extra reps" value={entries.reps} onChange={(v) => onChange({ ...entries, reps: v }, [ev('input', { reps: v })])} />
    </>
  )
}

// ── Max load ───────────────────────────────────────────────────────────────────
function MaxLoad({ part, lane, loadFor, entries, onChange }: {
  part: JudgePart; lane: Lane; loadFor: (m: JudgePart['part_movements'][number]) => string | null
  entries: LoadEntries; onChange: (e: Entries, events?: JudgeEvent[]) => void
}) {
  const owners = part.load_entry === 'per_team'
    ? [{ id: 'pair', label: 'Pair' }]
    : lane.team.athletes.map((a) => ({ id: a.id, label: a.first_name }))
  const cols = `90px repeat(${part.part_movements.length}, minmax(0, 1fr))`
  const set = (owner: string, mv: string, raw: string) => {
    const n = raw.trim() === '' ? null : Number(raw)
    const value = n != null && Number.isFinite(n) ? n : null
    onChange({ kind: 'max_load', lifts: { ...entries.lifts, [owner]: { ...(entries.lifts[owner] ?? {}), [mv]: value } } }, [ev('lift', { owner, movement_id: mv, kg: value })])
  }
  return (
    <>
      <CapClock part={part} />
      <div className="j-load">
        <div className="row-h" style={{ gridTemplateColumns: cols }}>
          <span></span>
          {part.part_movements.map((m) => (
            <span key={m.id} className="small" style={{ fontWeight: 700, textAlign: 'center' }}>{m.name}{loadFor(m) ? <span className="subtle"> · {loadFor(m)}</span> : null}</span>
          ))}
        </div>
        {owners.map((o) => (
          <div key={o.id} className="row-v" style={{ gridTemplateColumns: cols }}>
            <span style={{ fontWeight: 600 }}>{o.label}</span>
            {part.part_movements.map((m) => (
              <DecimalInput key={m.id} placeholder="kg" label={`${o.label} ${m.name} kg`}
                value={entries.lifts[o.id]?.[m.id!] ?? null} onChange={(raw) => set(o.id, m.id!, raw)} />
            ))}
          </div>
        ))}
      </div>
      {part.part_movements.some((m) => m.standards) && (
        <details className="small muted"><summary>Standards</summary>
          {part.part_movements.filter((m) => m.standards).map((m) => <p key={m.id} style={{ marginTop: 6 }}><b>{m.name}:</b> {m.standards}</p>)}
        </details>
      )}
    </>
  )
}

// ── Shared bits ────────────────────────────────────────────────────────────────
function MovementList({ part, sex, loadFor }: { part: JudgePart; sex: Sex; loadFor: (m: JudgePart['part_movements'][number]) => string | null }) {
  if (!part.part_movements.length) return null
  return (
    <div className="stack-sm">
      {part.part_movements.map((m) => (
        <div key={m.id} className="j-mv" style={{ gridTemplateColumns: '1fr' }}>
          <div>
            <div className="nm">{repsFor(m, sex) || ''} {m.name}{loadFor(m) ? ` · ${loadFor(m)}` : ''}</div>
            {m.standards && <div className="std">{m.standards}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

/** A simple countdown for AMRAP / max-load windows. Not part of the score. */
function CapClock({ part }: { part: JudgePart }) {
  const [start, setStart] = useState<number | null>(null)
  const now = useNow(start != null)
  if (part.time_cap_seconds == null) return null
  const left = start == null ? part.time_cap_seconds : Math.max(0, part.time_cap_seconds - (now - start) / 1000)
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className={`j-clock${start != null && left <= 10 ? ' over' : ''}`} style={{ fontSize: '2.2rem', padding: 0 }}>{formatTime(left, false)}</span>
      {start == null
        ? <button type="button" className="btn" onClick={() => setStart(Date.now())}>Start {formatTime(part.time_cap_seconds, false)}</button>
        : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStart(null)}>Reset clock</button>}
    </div>
  )
}

/** Keeps the typed text (so "52." survives while typing 52.5) and reports it on every change. */
function DecimalInput({ value, onChange, label, placeholder, className = 'input', style }: {
  value: number | null; onChange: (raw: string) => void; label: string; placeholder?: string; className?: string; style?: React.CSSProperties
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  // follow outside changes (e.g. the score reloaded from the server) without fighting the typist
  useEffect(() => {
    const n = text.trim() === '' ? null : Number(text)
    if (n !== value && !(n == null && value == null)) setText(value == null ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input className={className} style={style} inputMode="decimal" placeholder={placeholder} aria-label={label} value={text}
      onChange={(e) => { const t = e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''); setText(t); onChange(t) }} />
  )
}

/** Big rep-tap button: each tap counts `step` reps. Feeds the live race screen. */
function TapPad({ what, count, need, step, onTap }: { what: string; count: number; need?: number; step: number; onTap: (dir: 1 | -1) => void }) {
  return (
    <div className="j-tap">
      <button type="button" className="minus" aria-label={`Take off ${step} ${what}`} disabled={count <= 0 && need != null} onClick={() => onTap(-1)}>−{step}</button>
      <button type="button" className="plus" aria-label={`Add ${step} ${what}`} onClick={() => { navigator.vibrate?.(15); onTap(1) }}>
        <b>+{step}</b>
        <small>{what} · <span className="mono">{count}{need != null ? `/${need}` : ''}</span></small>
      </button>
    </div>
  )
}

function Stepper({ label, value, onChange, max }: { label: string; value: number | null; onChange: (v: number | null) => void; max?: number }) {
  const clamp = (n: number) => Math.max(0, max != null ? Math.min(max, n) : n)
  return (
    <div className="field">
      {label && <span>{label}</span>}
      <div className="j-step">
        <button type="button" aria-label={`${label || 'Reps'} minus one`} onClick={() => onChange(clamp((value ?? 0) - 1))}>−</button>
        <input className="input" inputMode="numeric" aria-label={label || 'Reps'} value={value ?? ''}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); onChange(v === '' ? null : clamp(Number(v))) }} />
        <button type="button" aria-label={`${label || 'Reps'} plus one`} onClick={() => onChange(clamp((value ?? -1) + 1))}>+</button>
      </div>
    </div>
  )
}

function SubmitPanel({ lane, complete, signedBy, onSign, onSubmit }: {
  lane: Lane; complete: boolean; signedBy: string; onSign: (name: string) => void; onSubmit: () => void
}) {
  const [agreed, setAgreed] = useState(false)
  if (!complete) return <p className="small subtle" style={{ textAlign: 'center' }}>Finish entering the score, then the captain checks it here.</p>
  const captain = lane.team.athletes.find((a) => a.is_captain) ?? lane.team.athletes[0]
  const name = signedBy || (captain ? `${captain.first_name} ${captain.last_name}`.trim() : '')
  return (
    <div className="stack-sm">
      <span className="small" style={{ fontWeight: 600 }}>Show the captain this score</span>
      <div className="seg">
        {lane.team.athletes.map((a) => {
          const n = `${a.first_name} ${a.last_name}`.trim()
          return <button key={a.id} type="button" aria-pressed={n === name} onClick={() => onSign(n)}>{n}{a.is_captain ? ' (captain)' : ''}</button>
        })}
      </div>
      <label className="check" style={{ fontSize: '1rem' }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        {name || 'The athlete'} has checked and agrees with this score
      </label>
      <button type="button" className="btn j-big" disabled={!agreed} onClick={() => { if (!signedBy && name) onSign(name); onSubmit() }}>
        Submit score
      </button>
    </div>
  )
}
