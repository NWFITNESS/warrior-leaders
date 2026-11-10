'use client'

import { useEffect, useRef, useState } from 'react'
import { getDraft, putDraft, queue, type Draft, type JudgeEvent, type JudgePart, type Lane, judgeNow, syncHeatStart, fetchHeatClock } from '@/lib/judge-client'
import {
  amrapPosition, amrapTap, autoTiebreak, chipperFixedReps, chipperPosition, chipperSetTotal, chipperTapEntries, isMetres, computeScore, forTimeTap, emptyEntries, formatTime, loadComplete, repsFor, repsPerRound, roundValue, tapStep,
  type Entries, type ForTimeEntries, type LoadEntries, type RoundEntry, type Sex,
} from '@/lib/scoring'
import { loadForSex, parseCap, partTitle, resolvePart, tiebreakRule } from '@/lib/types'
import { SignaturePad } from './signature-pad'
import { Standards } from '@/components/Standards'

const ev = (kind: string, payload: Record<string, unknown> = {}): JudgeEvent => ({ kind, payload, at: new Date().toISOString() })

function initialDraft(lane: Lane, part: JudgePart, preview = false): Draft {
  if (preview) return { entries: emptyEntries(part), tiebreak: '', signed_by: '', status: 'draft', updatedAt: 0 }
  const local = getDraft(lane.lane_assignment_id, part.id)
  const server = lane.scores.find((s) => s.part_id === part.id)
  const serverEntries = server?.entries && 'kind' in server.entries ? (server.entries as Entries) : null
  const serverStatus = server?.status === 'submitted' || server?.status === 'appeal' || server?.status === 'verified' ? 'submitted' : 'draft'
  const locked = server?.status === 'verified' || server?.status === 'rejected' ? server.status : undefined
  // the phone's copy wins if it's newer than what the server has (e.g. saved while offline)
  if (local && (!server || local.updatedAt >= Date.parse(server.updated_at))) return { ...local, locked: locked ?? local.locked }
  if (serverEntries) return { entries: serverEntries, tiebreak: server?.tiebreak_value != null && tiebreakRule(part) === 'manual' ? String(server.tiebreak_value) : '', signed_by: server?.signed_by ?? '', signature: server?.signature ?? '', status: serverStatus, updatedAt: Date.parse(server!.updated_at), locked }
  return { entries: emptyEntries(part), tiebreak: '', signed_by: '', status: 'draft', updatedAt: 0, locked }
}

/** `preview`: the admin's workout preview — same screens, but nothing is stored on this device or sent. */
export function PartScorer({ lane, part: rawPart, preview = false }: { lane: Lane; part: JudgePart; preview?: boolean }) {
  // Scaled teams see (and are scored on) the Scaled version of each movement
  const part = resolvePart(rawPart, lane.team.level)
  const sex: Sex = lane.team.sex
  const [draft, setDraft] = useState<Draft>(() => initialDraft(lane, part, preview))
  const draftRef = useRef(draft)
  draftRef.current = draft

  const athleteIds = lane.team.athletes.map((a) => a.id)
  const result = computeScore(part, sex, draft.entries)
  const complete = draft.entries.kind === 'max_load' ? loadComplete(part, athleteIds, draft.entries) : result.complete
  const locked = !!draft.locked
  const submitted = draft.status === 'submitted'

  const rule = tiebreakRule(part)
  // AMRAP / max reps / max load countdown: a +rep tap starts it if the judge hasn't
  // (a chipper keeps its start in the score, so a reload doesn't lose the clock)
  const [clockStart, setClockStart] = useState<number | null>(() => (draft.entries.kind === 'max_reps' ? draft.entries.started_at ?? null : null))
  const startClock = (dir: 1 | -1) => { if (dir > 0 && clockStart == null && part.time_cap_seconds != null) setClockStart(judgeNow()) }
  const auto = autoTiebreak(part, sex, draft.entries)
  // max reps: the typed total only opens once time's up (or the judge says the phone failed)
  const clockNow = useNow(clockStart != null)
  const timeUp = clockStart != null && part.time_cap_seconds != null && (clockNow - clockStart) / 1000 >= part.time_cap_seconds
  const [handEntry, setHandEntry] = useState(false)

  // ── Heat clock: every lane in a heat runs on ONE clock, the first judge's start.
  //  • A judge who starts late (or whose first tap starts the clock) is moved back to the heat's start;
  //    every time they've recorded shifts with it.
  //  • A lane that hasn't started yet starts itself as soon as any judge in the heat starts.
  //  • A judge who wiped the round and starts again (a re-run) sets a new heat start instead.
  // Side events start whenever, so they're left alone.
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const synced = useRef(new Set<string>())
  const resetAt = useRef<Record<number, number>>({}) // round → when this judge last wiped it
  const capMs = (part.time_cap_seconds ?? 20 * 60) * 1000
  const note = (text: string) => { setSyncNote(text); window.setTimeout(() => setSyncNote(null), 4000) }
  const heatSynced = !preview && !lane.workout.open_entry

  useEffect(() => {
    if (!heatSynced) return
    const e = draft.entries
    const starts = e.kind === 'for_time'
      ? e.rounds.map((r, i) => ({ round: i + 1, ms: r.started_at })).filter((x): x is { round: number; ms: number } => x.ms != null)
      : e.kind === 'max_reps' && e.started_at ? [{ round: 1, ms: e.started_at }] : []
    for (const st of starts) {
      const key = `${st.round}:${st.ms}`
      if (synced.current.has(key)) continue
      synced.current.add(key)
      if (judgeNow() - st.ms > capMs || st.ms - judgeNow() > 20_000) continue // an old start restored after a reload
      const restart = (resetAt.current[st.round] ?? Infinity) < st.ms
      void syncHeatStart(lane.lane_assignment_id, part.id, st.round, st.ms, restart).then((heatMs) => {
        if (heatMs == null) return
        const delta = st.ms - heatMs // > 0: this judge started after the heat did
        if (Math.abs(delta) < 50) return
        if (delta > capMs || delta < -5000) return // not the same run
        synced.current.add(`${st.round}:${heatMs}`)
        tapEntries((cur) => shiftStart(cur, st.round, st.ms, heatMs))
        if (draftRef.current.entries.kind === 'max_reps') setClockStart(heatMs)
        note(`Clock synced with the heat (${delta > 0 ? '+' : '−'}${(Math.abs(delta) / 1000).toFixed(1)} s)`)
      })
    }
  }, [draft.entries]) // eslint-disable-line react-hooks/exhaustive-deps

  // Not started yet? Watch the heat: when another judge starts, this lane starts on the same clock.
  const e0 = draft.entries
  const waitRound = (() => {
    if (!heatSynced || locked || submitted) return null
    if (e0.kind === 'for_time') {
      const movements = part.part_movements
      const ri = e0.rounds.findIndex((r) => !(movements.length && r.ticks.length >= movements.length) && !(r.capped && r.partial_reps != null && r.confirmed))
      const r = e0.rounds[ri]
      return r && !r.started_at && !r.ticks.length ? { round: ri + 1, after: ri > 0 ? e0.rounds[ri - 1].started_at ?? 0 : 0 } : null
    }
    if (e0.kind === 'max_reps' && part.time_cap_seconds != null) return clockStart == null && !e0.started_at ? { round: 1, after: 0 } : null
    return null
  })()
  useEffect(() => {
    if (!waitRound) return
    let stop = false
    const check = async () => {
      const starts = await fetchHeatClock(lane.lane_assignment_id, part.id)
      const ms = starts?.[waitRound.round]
      if (stop || ms == null) return
      const age = judgeNow() - ms
      if (age < -5000 || age > capMs) return // not this run
      if (ms <= waitRound.after) return // left over from an earlier round
      if ((resetAt.current[waitRound.round] ?? 0) > ms) return // this judge wiped it after that start: wait for the re-run
      synced.current.add(`${waitRound.round}:${ms}`)
      tapEntries((cur) => {
        if (cur.kind === 'for_time') {
          const r = cur.rounds[waitRound.round - 1]
          if (!r || r.started_at || r.ticks.length) return null
          return { entries: { ...cur, rounds: cur.rounds.map((x, i) => (i === waitRound.round - 1 ? { ...x, started_at: ms } : x)) }, events: [ev('start', { round: waitRound.round, via: 'heat' })] }
        }
        if (cur.kind === 'max_reps' && !cur.started_at) return { entries: { ...cur, started_at: ms }, events: [ev('start', { round: 1, via: 'heat' })] }
        return null
      })
      if (draftRef.current.entries.kind === 'max_reps') setClockStart(ms)
      navigator.vibrate?.([60, 40, 60])
      note(`Heat started ${Math.max(0, Math.round(age / 1000))} s ago: clock running`)
    }
    void check()
    const id = window.setInterval(() => void check(), 1500)
    return () => { stop = true; window.clearInterval(id) }
  }, [waitRound?.round, waitRound?.after]) // eslint-disable-line react-hooks/exhaustive-deps

  // Max reps: the Start button writes the start into the score too, so it syncs with the heat
  const setMaxRepsClock = (v: number | null) => {
    setClockStart(v)
    if (draftRef.current.entries.kind !== 'max_reps') return
    if (v == null) { resetAt.current[1] = judgeNow(); commit({ entries: { ...draftRef.current.entries, started_at: null } }, [ev('reset_clock')]); return }
    if (!draftRef.current.entries.started_at) commit({ entries: { ...draftRef.current.entries, started_at: v } }, [ev('start', { round: 1 })])
  }

  function commit(next: Partial<Draft>, events: JudgeEvent[] = [], status: Draft['status'] = 'draft') {
    // a changed score needs signing again
    const resign = next.entries && next.entries !== draftRef.current.entries ? { signature: '' } : {}
    const d: Draft = { ...draftRef.current, ...next, ...resign, status, updatedAt: Date.now() }
    for (const x of events) if (x.kind === 'reset_round') resetAt.current[Number(x.payload.round) || 1] = judgeNow()
    draftRef.current = d
    setDraft(d)
    if (preview) return
    putDraft(lane.lane_assignment_id, part.id, d)
    const r = computeScore(part, sex, d.entries)
    const tbAuto = autoTiebreak(part, sex, d.entries)
    const tb = tbAuto ? tbAuto.value : rule === 'manual' && d.tiebreak.trim() ? parseCap(d.tiebreak) ?? Number(d.tiebreak) : null
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
        signature: d.signature || null,
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

  // the team's own weight: already their RX/Scaled version (resolvePart), then their M/F number (60/40kg → 60kg)
  const loadFor = (m: JudgePart['part_movements'][number]) => loadForSex(m.rx_load, sex)

  return (
    <div className="j-scorer">
      {syncNote && <div className="j-banner ok">⏱ {syncNote}</div>}
      {part.notes && <div className="j-banner">{part.notes}</div>}
      {!part.scored && <div className="j-banner">{partTitle(part) ?? 'This part'} is a buy-in and isn’t scored on the leaderboard. Record it anyway so the head judge has it.</div>}
      {locked && <div className="j-banner ok">This score has been {draft.locked} by the head judge and can’t be changed here.</div>}

      <fieldset disabled={locked || submitted} className="j-fields">
        {draft.entries.kind === 'for_time' && (
          <ForTime part={part} sex={sex} entries={draft.entries} loadFor={loadFor} onChange={setEntries}
            onTap={(dir) => tapEntries((e) => { if (e.kind !== 'for_time') return null; const t = forTimeTap(part, sex, e, dir, judgeNow()); return t && { entries: t.entries, events: [...(t.started ? [ev('start', { round: t.round, via: 'tap' })] : []), ...(t.tick ? [ev('tick', { ...t.tick, via: 'tap' })] : [])] } })} />
        )}
        {draft.entries.kind === 'amrap' && (
          <Amrap part={part} sex={sex} loadFor={loadFor} entries={draft.entries} onChange={setEntries} clock={<CapClock part={part} start={clockStart} setStart={setClockStart} />}
            onTap={(dir) => { startClock(dir); tapEntries((e) => e.kind === 'amrap' ? { entries: { kind: 'amrap', ...amrapTap(part, sex, e.rounds ?? 0, e.reps ?? 0, dir) } } : null) }} />
        )}
        {draft.entries.kind === 'max_reps' && (() => {
          const e = draft.entries
          const total = e.reps ?? 0
          const chipper = part.part_movements.length > 1 && part.part_movements.some((m) => repsFor(m, sex) > 0)
          const tapChipper = (dir: 1 | -1) => {
            const now = judgeNow()
            if (dir > 0 && clockStart == null) setClockStart(e.started_at || now)
            tapEntries((x) => x.kind === 'max_reps' ? { entries: chipperTapEntries(part, sex, x, dir, now, clockStart) } : null)
          }
          if (!chipper) {
            return (
              <>
                <MovementList part={part} sex={sex} loadFor={loadFor} />
                <CapClock part={part} start={clockStart} setStart={setMaxRepsClock} />
                <TapPad what="Total reps" count={total} step={tapStep(part.part_movements[0])} unit={isMetres(part.part_movements[0]) ? 'm' : undefined}
                  onTap={(dir) => { startClock(dir); tapEntries((x) => x.kind === 'max_reps' ? { entries: { ...x, kind: 'max_reps', reps: Math.max(0, (x.reps ?? 0) + dir * tapStep(part.part_movements[0])) } } : null) }} />
                <Stepper label="Total reps" value={e.reps} onChange={(v) => setEntries({ ...e, kind: 'max_reps', reps: v }, [ev('input', { reps: v })])} />
              </>
            )
          }
          // Chipper (e.g. 3 rounds, then max handstand walk): laid out like a for-time workout.
          // The current movement is highlighted with the tap pad under it; typing opens only at time's up.
          const pos = chipperPosition(part, sex, total)
          const fixed = chipperFixedReps(part, sex)
          const last = part.part_movements.at(-1)
          const lastName = last?.name.replace(/ ·.*$/, '') ?? 'the last movement'
          const typedBefore = total > 0 && !(e.marks ?? []).length && clockStart == null // an older hand-typed score
          const canType = timeUp || handEntry || typedBefore
          const short = total > 0 && total < fixed && !(e.marks ?? []).length
          return (
            <>
              <CapClock part={part} start={clockStart} setStart={setMaxRepsClock} />
              <ol className="j-list">
                {part.part_movements.map((m) => {
                  const mark = (e.marks ?? []).find((x) => x.movement_id === m.id)
                  const cur = pos?.movement.id === m.id && !timeUp
                  const reps = repsFor(m, sex)
                  const load = loadFor(m)
                  return (
                    <li key={m.id} className={`j-item${cur ? ' cur' : ''}${mark ? ' done' : ''}`}>
                      <div className="j-item-row">
                        <span className="j-idx" aria-hidden>{mark ? '✓' : m.sort_order + 1}</span>
                        <div className="j-item-main">
                          <div className="j-item-name">{reps > 0 && <b>{reps}</b>} {m.name}</div>
                          {load && <div className="j-item-meta">{load}</div>}
                        </div>
                        {mark && <span className="j-split">{formatTime(mark.at)}</span>}
                      </div>
                      {cur && <Standards text={m.standards} collapsible className="std" />}
                      {cur && isMetres(m) && !reps && <div className="j-banner">Count <b>metres</b>, not lengths: 1 tap = 1 metre. A 3m length is 3 taps.</div>}
                      {cur && pos && (
                        <TapPad what={`Total ${total}`} count={pos.done} need={pos.need ?? undefined} step={tapStep(m)} unit={isMetres(m) ? 'm' : undefined} onTap={tapChipper} />
                      )}
                    </li>
                  )
                })}
              </ol>
              {canType ? (
                <section className={`j-panel${timeUp ? ' warn' : ''}`}>
                  {timeUp && <h3>Time’s up · check the total</h3>}
                  <Stepper label="Total reps for the whole workout" value={e.reps}
                    onChange={(v) => setEntries(chipperSetTotal(part, sex, e, v), [ev('input', { reps: v })])} />
                  <p className="j-note">This is everything: all {fixed} reps before {lastName}, plus their {lastName} {last && isMetres(last) ? 'metres' : 'reps'}.</p>
                  {short && (
                    <div className="j-panel warn">
                      <p className="j-note">That’s less than the {fixed} reps before {lastName}. If the team finished those, their total is {fixed} + {total} = <b>{fixed + total}</b>.</p>
                      <button type="button" className="j-primary" onClick={() => setEntries(chipperSetTotal(part, sex, e, fixed + total), [ev('input', { reps: fixed + total, added_fixed: fixed })])}>
                        Make it {fixed + total}
                      </button>
                    </div>
                  )}
                </section>
              ) : (
                <div className="j-toolbar">
                  <button type="button" className="j-tool" onClick={() => { if (window.confirm('Only type the total if the phone or clock failed. Typing skips the tiebreak times. Carry on?')) { setHandEntry(true); commit({}, [ev('hand_entry')]) } }}>
                    Phone or clock problem? Type the total
                  </button>
                </div>
              )}
            </>
          )
        })()}
        {draft.entries.kind === 'max_load' && (
          <MaxLoad part={part} lane={lane} loadFor={loadFor} entries={draft.entries} onChange={setEntries} clock={<CapClock part={part} start={clockStart} setStart={setClockStart} />} />
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

        {rule === 'manual' && (
          <label className="field">
            <span>Tiebreak{part.tiebreak_note ? ` · ${part.tiebreak_note}` : ''}</span>
            <input className="input mono" style={{ fontSize: '1.3rem', padding: 12 }} inputMode="decimal" placeholder={part.score_type === 'max_load' ? 'kg' : 'mm:ss'}
              value={draft.tiebreak} onChange={(e) => commit({ tiebreak: e.target.value }, [ev('tiebreak', { value: e.target.value })])} />
          </label>
        )}
      </fieldset>

      <section className={`j-panel j-score${complete ? ' ready' : ''}`}>
        <div className="j-score-head">
          <span>{part.score_type === 'for_time' && part.rounds > 1 ? `Total · ${part.rounds} rounds` : 'Score'}</span>
          <b>{result.display}</b>
        </div>
        {result.detail.length > 1 && (
          <ul className="j-splits">
            {result.detail.map((d, i) => {
              const [k, ...v] = d.split(': ')
              const val = v.join(': ')
              if (val === 'Not started' || val === 'In progress') return null // only rounds with a result
              return <li key={i}><span>{v.length ? k : ''}</span><b>{v.length ? val : k}</b></li>
            })}
          </ul>
        )}
        {result.detail.length === 1 && <p className="j-note">{result.detail[0]}</p>}
        {auto && (
          <div className="j-tiebreak"><span>Tiebreak · {auto.label}</span><b>{auto.value != null ? formatTime(auto.value) : '—'}</b></div>
        )}

        {submitted ? (
          <div className="j-submitted">
            <span className={`j-status ${locked ? 'ok' : 'gold'}`}>
              {locked ? `${draft.locked === 'verified' ? 'Verified' : 'Rejected'} by head judge` : 'Submitted · awaiting head judge'}
            </span>
            {draft.signed_by && <span className="j-note">Agreed by {draft.signed_by}</span>}
            {draft.signature && <div className="j-sig-done"><SignaturePad value={draft.signature} onChange={() => {}} disabled /></div>}
            {!locked && <button type="button" className="j-tool" onClick={() => commit({}, [ev('reopen')], 'draft')}>Edit score</button>}
          </div>
        ) : (
          <SubmitPanel lane={lane} complete={complete} signedBy={draft.signed_by} signature={draft.signature ?? ''}
            onSign={(name) => commit({ signed_by: name }, [ev('captain', { name })])}
            onSignature={(sig) => commit({ signature: sig }, sig ? [ev('signature', { name: draft.signed_by })] : [])}
            onSubmit={() => commit({}, [ev('submit', { value: result.value, display: result.display })], 'submitted')} />
        )}
      </section>
    </div>
  )
}

// ── For time (single or timed rounds) ──────────────────────────────────────────
function useNow(active: boolean) {
  const [now, setNow] = useState(() => judgeNow())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(judgeNow()), 100)
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
  // The confirm button appears where Restart was, so a double tap would hit both: ignore it for 0.8s
  const armedAt = useRef(0)
  const askReset = () => { armedAt.current = Date.now(); setConfirmReset(true) }
  const sure = () => Date.now() - armedAt.current > 800

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

  const roundsBar = multi && (
    <div className="j-rounds" aria-label="Rounds">
      {entries.rounds.map((r, i) => {
        const v = roundValue(part, sex, r)
        return (
          <div key={i} className={`j-rnd${i < ri ? ' done' : i === ri ? ' on' : ''}`}>
            <span className="bar" />
            <span className="lbl">R{i + 1}{i < ri && v.value != null && <b>{formatTime(v.value, false)}</b>}</span>
          </div>
        )
      })}
    </div>
  )

  if (!round) {
    return (
      <>
        <section className="j-timer">{roundsBar}</section>
        <div className="j-banner ok">All {multi ? `${entries.rounds.length} rounds` : 'movements'} recorded. Check the score with the captain.</div>
        <div className="j-toolbar">
          {/* Undo just the last tick (a double-tap on the final movement); wiping the round needs a confirm */}
          {(() => { const last = entries.rounds.length - 1; const lr = entries.rounds[last]; return lr && lr.ticks.length > 0 && !lr.capped ? (
            <button type="button" className="j-tool" onClick={() => onChange({ kind: 'for_time', rounds: entries.rounds.map((r, i) => (i === last ? { ...r, reps_done: 0, ticks: r.ticks.slice(0, -1) } : r)) }, [ev('untick', { round: last + 1, movement_id: lr.ticks.at(-1)?.movement_id })])}>
              Undo last tick
            </button>
          ) : null })()}
          {confirmReset ? (
            <>
              <p className="j-note" style={{ flexBasis: '100%' }}>This wipes every tick and time in the {multi ? 'round' : 'workout'}. Only do it if the team is redoing it.</p>
              <button type="button" className="j-tool danger" onClick={() => { if (!sure()) return; setConfirmReset(false); const last = entries.rounds.length - 1; onChange({ kind: 'for_time', rounds: entries.rounds.map((r, i) => (i === last ? { started_at: null, ticks: [], capped: false, partial_reps: null } : r)) }, [ev('reset_round', { round: last + 1 })]) }}>Wipe and redo</button>
              <button type="button" className="j-tool" onClick={() => setConfirmReset(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="j-tool danger" onClick={askReset}>Redo last {multi ? 'round' : 'attempt'}</button>
          )}
        </div>
      </>
    )
  }

  const nextMv = round.ticks.length
  const remaining = cap != null ? cap - elapsed : null
  const tickNow = (m: JudgePart['part_movements'][number]) => {
    const at = Math.round(elapsed * 10) / 10
    // When the last rep ticks a movement, the next movement's "Done" slides up under the judge's finger.
    // Ignore a Done within 3s of the previous tick so a follow-up tap can't finish the next movement too.
    const prev = round.ticks.at(-1)
    if (prev && at - prev.at < 3) return
    update({ ...round, reps_done: 0, ticks: [...round.ticks, { movement_id: m.id!, at }] }, [ev('tick', { round: ri + 1, movement_id: m.id, movement: m.name, at_seconds: at })])
  }

  return (
    <>
      <section className="j-timer">
        {roundsBar}
        <div className={`j-clock${remaining != null && remaining <= 10 && running ? ' over' : ''}`}>{formatTime(round.capped ? cap : elapsed)}</div>
        <p className="j-clock-sub">
          {multi ? `Round ${ri + 1} of ${entries.rounds.length}` : 'For time'}
          {cap != null && ` · ${formatTime(cap, false)} ${multi ? 'window' : 'cap'}`}
          {running && remaining != null && <span className="left"> · {formatTime(Math.max(0, remaining), false)} left</span>}
        </p>
        {!round.started_at && (
          <button type="button" className="j-primary" onClick={() => update({ ...round, started_at: judgeNow() }, [ev('start', { round: ri + 1 })])}>
            {multi ? `Start round ${ri + 1}` : 'Start clock'}
          </button>
        )}
        {!round.started_at && <p className="j-note">or tap <b>+rep</b> below: the first rep starts the clock</p>}
      </section>

      <ol className="j-list">
        {movements.map((m, i) => {
          const tick = round.ticks.find((t) => t.movement_id === m.id)
          const cur = !!round.started_at && !round.capped && i === nextMv
          const load = loadFor(m)
          const reps = repsFor(m, sex)
          return (
            <li key={m.id} className={`j-item${cur ? ' cur' : ''}${tick ? ' done' : ''}`}>
              <div className="j-item-row">
                <span className="j-idx" aria-hidden>{tick ? '✓' : i + 1}</span>
                <div className="j-item-main">
                  <div className="j-item-name">{reps > 0 && <b>{reps}</b>} {m.name}</div>
                  {load && <div className="j-item-meta">{load}</div>}
                </div>
                {tick
                  ? <span className="j-split">{formatTime(tick.at)}</span>
                  : cur && (() => {
                    // just ticked the previous movement: Done waits 3s so a follow-up tap can't land on it
                    const prev = round.ticks.at(-1)
                    const wait = prev ? 3 - (elapsed - prev.at) : 0
                    return <button type="button" className="j-check" aria-label={`${m.name} done`} disabled={wait > 0} style={wait > 0 ? { opacity: 0.4 } : undefined} onClick={() => tickNow(m)}>{wait > 0 ? 'Wait…' : '✓ Done'}</button>
                  })()}
              </div>
              {!tick && (cur || !round.started_at) && <Standards text={m.standards} collapsible className="std" />}
              {(cur || (!round.started_at && !round.capped && i === nextMv)) && reps > 0 && <TapPad count={round.reps_done ?? 0} need={reps} step={tapStep(m)} onTap={onTap} />}
            </li>
          )
        })}
      </ol>

      {round.capped && (
        <section className="j-panel warn">
          <h3>Time’s up{multi ? ` · round ${ri + 1}` : ''}</h3>
          <p className="j-note">Reps completed on {movements[nextMv]?.name ?? 'the current movement'}</p>
          <Stepper label="" value={round.partial_reps} max={Math.max(0, repsFor(movements[nextMv] ?? { reps: 0, reps_female: null }, sex) - 1)}
            onChange={(v) => update({ ...round, partial_reps: v }, [ev('partial_reps', { round: ri + 1, reps: v })])} />
          <button type="button" className="j-primary" disabled={round.partial_reps == null}
            onClick={() => update({ ...round, partial_reps: round.partial_reps ?? 0, confirmed: true }, [ev('round_capped_done', { round: ri + 1, reps: round.partial_reps })])}>
            {round.partial_reps == null ? 'Enter reps' : multi && ri < entries.rounds.length - 1 ? 'Save · next round' : 'Save'}
          </button>
        </section>
      )}

      <div className="j-toolbar">
        <button type="button" className="j-tool" disabled={!round.ticks.length || round.capped}
          onClick={() => update({ ...round, reps_done: 0, ticks: round.ticks.slice(0, -1) }, [ev('untick', { round: ri + 1, movement_id: round.ticks.at(-1)?.movement_id })])}>
          Undo tick
        </button>
        {running && cap != null && (
          <button type="button" className="j-tool" onClick={() => update(capRound(round), [ev('cap', { round: ri + 1, auto: false, at_seconds: Math.round(elapsed * 10) / 10 })])}>
            Time’s up
          </button>
        )}
        {round.started_at && (confirmReset ? (
          <>
            <p className="j-note" style={{ flexBasis: '100%' }}>This stops the clock and wipes every tick{multi ? ' in this round' : ''}. Only do it for a false start.</p>
            <button type="button" className="j-tool danger" onClick={() => { if (!sure()) return; setConfirmReset(false); update({ started_at: null, ticks: [], capped: false, partial_reps: null, confirmed: false, reps_done: 0 }, [ev('reset_round', { round: ri + 1 })]) }}>Confirm restart</button>
            <button type="button" className="j-tool" onClick={() => setConfirmReset(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="j-tool danger" onClick={askReset}>Restart{multi ? ' round' : ''}</button>
        ))}
      </div>
    </>
  )
}

// ── AMRAP ──────────────────────────────────────────────────────────────────────
function Amrap({ part, sex, loadFor, entries, onChange, onTap, clock }: {
  part: JudgePart; sex: Sex; loadFor: (m: JudgePart['part_movements'][number]) => string | null
  entries: Extract<Entries, { kind: 'amrap' }>; onChange: (e: Entries, events?: JudgeEvent[]) => void; onTap: (dir: 1 | -1) => void; clock: React.ReactNode
}) {
  return (
    <>
      <MovementList part={part} sex={sex} loadFor={loadFor} />
      {clock}
      {repsPerRound(part, sex) > 0 && (() => {
        const pos = amrapPosition(part, sex, entries.reps ?? 0)
        return (
          <TapPad what={pos ? `Round ${(entries.rounds ?? 0) + 1} · ${pos.movement.name}` : undefined} count={pos?.done ?? 0} need={pos?.need} step={tapStep(pos?.movement)}
            onTap={onTap} />
        )
      })()}
      <Stepper label="Full rounds" value={entries.rounds} onChange={(v) => onChange({ ...entries, rounds: v }, [ev('input', { rounds: v })])} />
      <Stepper label="Extra reps" value={entries.reps} onChange={(v) => onChange({ ...entries, reps: v }, [ev('input', { reps: v })])} />
    </>
  )
}

// ── Max load ───────────────────────────────────────────────────────────────────
function MaxLoad({ part, lane, loadFor, entries, onChange, clock }: {
  part: JudgePart; lane: Lane; loadFor: (m: JudgePart['part_movements'][number]) => string | null
  entries: LoadEntries; onChange: (e: Entries, events?: JudgeEvent[]) => void; clock: React.ReactNode
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
      {clock}
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
      {part.part_movements.map((m) => <Standards key={m.id} text={m.standards} collapsible label={`${m.name} standards`} className="std" />)}
    </>
  )
}

// ── Shared bits ────────────────────────────────────────────────────────────────
function MovementList({ part, sex, loadFor }: { part: JudgePart; sex: Sex; loadFor: (m: JudgePart['part_movements'][number]) => string | null }) {
  if (!part.part_movements.length) return null
  return (
    <ol className="j-list">
      {part.part_movements.map((m, i) => {
        const reps = repsFor(m, sex)
        return (
          <li key={m.id} className="j-item">
            <div className="j-item-row">
              <span className="j-idx" aria-hidden>{i + 1}</span>
              <div className="j-item-main">
                <div className="j-item-name">{reps > 0 && <b>{reps}</b>} {m.name}</div>
                {loadFor(m) && <div className="j-item-meta">{loadFor(m)}</div>}
              </div>
            </div>
            <Standards text={m.standards} collapsible className="std" />
          </li>
        )
      })}
    </ol>
  )
}

/** A simple countdown for AMRAP / max-load windows. Not part of the score. */
function CapClock({ part, start, setStart }: { part: JudgePart; start: number | null; setStart: (v: number | null) => void }) {
  const now = useNow(start != null)
  if (part.time_cap_seconds == null) return null
  const left = start == null ? part.time_cap_seconds : Math.max(0, part.time_cap_seconds - (now - start) / 1000)
  return (
    <section className="j-timer">
      <div className={`j-clock${start != null && left <= 10 ? ' over' : ''}`}>{formatTime(left, false)}</div>
      <p className="j-clock-sub">{start == null ? `${formatTime(part.time_cap_seconds, false)} on the clock` : 'Counting down'}</p>
      {start == null
        ? <button type="button" className="j-primary" onClick={() => setStart(judgeNow())}>Start {formatTime(part.time_cap_seconds, false)}</button>
        : <div className="j-toolbar"><button type="button" className="j-tool" onClick={() => setStart(null)}>Reset clock</button></div>}
    </section>
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

/** Rep counter + tap buttons: each tap counts `step` reps. Feeds the live race screen. */
function TapPad({ what, count, need, step, unit, onTap }: { what?: string; count: number; need?: number; step: number; unit?: 'm'; onTap: (dir: 1 | -1) => void }) {
  const left = need != null ? Math.max(0, need - count) : null
  const word = unit === 'm' ? 'm' : step === 1 ? 'rep' : 'reps'
  return (
    <div className="j-tap">
      <div className="j-count" aria-live="polite">
        <span className="num"><b>{count}</b>{need != null && <span className="of">/ {need}</span>}</span>
        <span className="meta">
          {what && <span>{what}</span>}
          {left != null && <em>{left === 0 ? 'Complete' : `${left} to go`}</em>}
        </span>
      </div>
      <div className="j-tap-btns">
        <button type="button" className="minus" aria-label={`Take off ${step} ${unit === 'm' ? (step === 1 ? 'metre' : 'metres') : word}`} disabled={count <= 0 && need != null} onClick={() => onTap(-1)}>−{step}</button>
        <button type="button" className="plus" aria-label={`Add ${step} ${unit === 'm' ? (step === 1 ? 'metre' : 'metres') : word}`} onClick={() => { navigator.vibrate?.(15); onTap(1) }}>
          +{step} {word}
        </button>
      </div>
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

function SubmitPanel({ lane, complete, signedBy, signature, onSign, onSignature, onSubmit }: {
  lane: Lane; complete: boolean; signedBy: string; signature: string
  onSign: (name: string) => void; onSignature: (path: string) => void; onSubmit: () => void
}) {
  if (!complete) return <p className="j-note">Finish the score, then the captain checks and signs it here.</p>
  const captain = lane.team.athletes.find((a) => a.is_captain) ?? lane.team.athletes[0]
  const name = signedBy || (captain ? `${captain.first_name} ${captain.last_name}`.trim() : '')
  return (
    <div className="j-sign">
      <p className="j-label">Who’s signing?</p>
      <div className="j-choice">
        {lane.team.athletes.map((a) => {
          const n = `${a.first_name} ${a.last_name}`.trim()
          return <button key={a.id} type="button" aria-pressed={n === name} onClick={() => onSign(n)}>{n}{a.is_captain && <small>Captain</small>}</button>
        })}
      </div>
      <p className="j-label" style={{ marginTop: 8 }}>{name || 'The athlete'} signs to agree this score</p>
      <SignaturePad value={signature} onChange={onSignature} />
      <button type="button" className="j-primary" style={{ marginTop: 8 }} disabled={!signature} onClick={() => { if (!signedBy && name) onSign(name); onSubmit() }}>
        {signature ? 'Submit score' : 'Sign to submit'}
      </button>
    </div>
  )
}

/** Move a lane's clock start to the heat's start: the start changes and every recorded time shifts with it. */
function shiftStart(e: Entries, round: number, fromMs: number, toMs: number): { entries: Entries; events: JudgeEvent[] } | null {
  const shift = Math.round((fromMs - toMs) / 100) / 10 // seconds added to each recorded time
  const at = (x: number) => Math.round((x + shift) * 10) / 10
  const event = ev('clock_sync', { round, shift_seconds: shift })
  if (e.kind === 'for_time') {
    const r = e.rounds[round - 1]
    if (!r || r.started_at !== fromMs) return null
    return { entries: { ...e, rounds: e.rounds.map((x, i) => (i === round - 1 ? { ...x, started_at: toMs, ticks: x.ticks.map((t) => ({ ...t, at: at(t.at) })) } : x)) }, events: [event] }
  }
  if (e.kind === 'max_reps') {
    if (e.started_at !== fromMs) return null
    return { entries: { ...e, started_at: toMs, marks: (e.marks ?? []).map((m) => ({ ...m, at: at(m.at) })) }, events: [event] }
  }
  return null
}
