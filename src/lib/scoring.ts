// Turns what a judge entered into a score. Shared by the judge app and the admin,
// so both always calculate the same number.
import type { Movement, WorkoutPart } from './types'

export type Sex = 'male' | 'female' | 'mixed'

export interface Tick { movement_id: string; at: number } // seconds from the start of that round

export interface RoundEntry {
  started_at: number | null // epoch ms when the judge started the round clock
  ticks: Tick[]
  capped: boolean
  partial_reps: number | null // capped: reps done on the movement they were on
  confirmed?: boolean // capped: judge pressed Save after entering partial reps
  reps_done?: number // reps tapped so far on the current movement (live screen + pre-fills capped reps)
}

export interface ForTimeEntries { kind: 'for_time'; rounds: RoundEntry[] }
export interface AmrapEntries { kind: 'amrap'; rounds: number | null; reps: number | null }
export interface RepsEntries { kind: 'max_reps'; reps: number | null }
export interface LoadEntries { kind: 'max_load'; lifts: Record<string, Record<string, number | null>> } // owner (athlete id or 'pair') → movement id → kg
export interface OtherEntries { kind: 'other'; value: number | null }
export type Entries = ForTimeEntries | AmrapEntries | RepsEntries | LoadEntries | OtherEntries

export interface ScoreResult {
  value: number | null // what gets ranked
  complete: boolean // every required input is filled in
  capped: boolean
  display: string
  detail: string[] // per-round or per-lift breakdown
}

export function repsFor(m: Pick<Movement, 'reps' | 'reps_female'>, sex: Sex) {
  return (sex === 'female' ? m.reps_female ?? m.reps : m.reps) ?? 0
}

export function repsPerRound(part: Pick<WorkoutPart, 'part_movements'>, sex: Sex) {
  return part.part_movements.reduce((n, m) => n + repsFor(m, sex), 0)
}

export function emptyEntries(part: Pick<WorkoutPart, 'score_type' | 'rounds'>): Entries {
  switch (part.score_type) {
    case 'for_time':
      return { kind: 'for_time', rounds: Array.from({ length: Math.max(1, part.rounds || 1) }, () => ({ started_at: null, ticks: [], capped: false, partial_reps: null })) }
    case 'amrap': return { kind: 'amrap', rounds: null, reps: null }
    case 'max_reps': return { kind: 'max_reps', reps: null }
    case 'max_load': return { kind: 'max_load', lifts: {} }
    default: return { kind: 'other', value: null }
  }
}

/** Seconds as m:ss.t (12:47.3). */
export function formatTime(seconds: number | null | undefined, tenths = true) {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  // work in whole tenths so floating-point noise (1.1 → 1.0999…) can't knock a digit off
  const total = Math.round(Math.max(0, seconds) * 10)
  const m = Math.floor(total / 600)
  const ss = String(Math.floor((total % 600) / 10)).padStart(2, '0')
  return tenths ? `${m}:${ss}.${total % 10}` : `${m}:${ss}`
}

/** Reps done in a capped round: completed movements + partial reps on the current one. */
export function cappedRoundReps(part: Pick<WorkoutPart, 'part_movements'>, sex: Sex, round: RoundEntry) {
  const done = new Set(round.ticks.map((t) => t.movement_id))
  const full = part.part_movements.filter((m) => done.has(m.id!)).reduce((n, m) => n + repsFor(m, sex), 0)
  return full + (round.partial_reps ?? 0)
}

export function roundValue(part: WorkoutPart, sex: Sex, round: RoundEntry): { value: number | null; capped: boolean; label: string } {
  const movements = part.part_movements
  const cap = part.time_cap_seconds
  if (movements.length && round.ticks.length >= movements.length) {
    const t = Math.max(...round.ticks.map((x) => x.at))
    return { value: t, capped: false, label: formatTime(t) }
  }
  if (round.capped && round.partial_reps == null) {
    return { value: null, capped: true, label: 'CAP · reps needed' }
  }
  if (round.capped && cap != null) {
    const done = cappedRoundReps(part, sex, round)
    const missing = Math.max(0, repsPerRound(part, sex) - done)
    const value = part.capped_round_rule === 'cap_only' ? cap : cap + missing
    return { value, capped: true, label: `CAP · ${done} reps (${formatTime(value, false)})` }
  }
  return { value: null, capped: false, label: round.started_at ? 'In progress' : 'Not started' }
}

export function computeScore(part: WorkoutPart, sex: Sex, entries: Entries): ScoreResult {
  switch (entries.kind) {
    case 'for_time': {
      const rounds = entries.rounds.map((r) => roundValue(part, sex, r))
      const complete = rounds.every((r) => r.value != null)
      const value = complete ? Math.round(rounds.reduce((n, r) => n + (r.value ?? 0), 0) * 10) / 10 : null
      const capped = rounds.some((r) => r.capped)
      const multi = entries.rounds.length > 1
      return {
        value, complete, capped,
        display: value == null ? '—' : formatTime(value),
        detail: multi ? rounds.map((r, i) => `Round ${i + 1}: ${r.label}`) : rounds.map((r) => r.label),
      }
    }
    case 'amrap': {
      const per = repsPerRound(part, sex)
      const complete = entries.rounds != null && entries.reps != null
      const value = complete ? (per > 0 ? entries.rounds! * per + entries.reps! : entries.rounds! * 1000 + entries.reps!) : null
      return { value, complete, capped: false, display: complete ? `${entries.rounds} rds + ${entries.reps}` : '—', detail: per ? [`${per} reps per round`] : [] }
    }
    case 'max_reps':
      return { value: entries.reps, complete: entries.reps != null, capped: false, display: entries.reps != null ? `${entries.reps} reps` : '—', detail: [] }
    case 'max_load': {
      const all = Object.values(entries.lifts).flatMap((byMv) => Object.values(byMv))
      const filled = all.filter((v): v is number => v != null && Number.isFinite(v))
      const total = Math.round(filled.reduce((n, v) => n + v, 0) * 10) / 10
      return { value: filled.length ? total : null, complete: false, capped: false, display: filled.length ? `${total} kg` : '—', detail: [] }
    }
    default:
      return { value: entries.value, complete: entries.value != null, capped: false, display: entries.value != null ? `${entries.value}${part.unit ? ' ' + part.unit : ''}` : '—', detail: [] }
  }
}

/** Reps one tap of the judge's + button counts for a movement. */
export function tapStep(m: Pick<Movement, 'tap_step'> | undefined) {
  return Math.max(1, m?.tap_step || 1)
}

/** One tap on a for-time workout, worked out from the latest entries (never a stale screen):
 *  adds `tap_step` reps to the current movement; reaching its reps ticks it off at `nowMs`. */
export function forTimeTap(part: WorkoutPart, sex: Sex, entries: ForTimeEntries, dir: 1 | -1, nowMs: number) {
  const mv = part.part_movements
  const ri = entries.rounds.findIndex((r) => !(mv.length && r.ticks.length >= mv.length) && !(r.capped && r.partial_reps != null && r.confirmed))
  const round = entries.rounds[ri]
  if (!round?.started_at || round.capped) return null
  const m = mv[round.ticks.length]
  if (!m) return null
  const need = repsFor(m, sex)
  const next = Math.max(0, Math.min(need, (round.reps_done ?? 0) + dir * tapStep(m)))
  let r: RoundEntry = { ...round, reps_done: next }
  let tick: { round: number; movement_id: string; movement: string; at_seconds: number } | null = null
  if (dir > 0 && need > 0 && next >= need) {
    const at = Math.round(((nowMs - round.started_at) / 1000) * 10) / 10
    r = { ...round, reps_done: 0, ticks: [...round.ticks, { movement_id: m.id!, at }] }
    tick = { round: ri + 1, movement_id: m.id!, movement: m.name, at_seconds: at }
  }
  return { entries: { kind: 'for_time' as const, rounds: entries.rounds.map((x, i) => (i === ri ? r : x)) }, tick }
}

/** Where a team is inside an AMRAP round: which movement, and reps done / needed on it. */
export function amrapPosition(part: Pick<WorkoutPart, 'part_movements'>, sex: Sex, repsIntoRound: number) {
  let start = 0
  for (let i = 0; i < part.part_movements.length; i++) {
    const m = part.part_movements[i]
    const need = repsFor(m, sex)
    if (repsIntoRound < start + need) return { index: i, movement: m, done: repsIntoRound - start, need }
    start += need
  }
  return null
}

/** One tap (+1 = forward, -1 = back) on an AMRAP: moves through the movements and rolls over to the next round. */
export function amrapTap(part: Pick<WorkoutPart, 'part_movements'>, sex: Sex, rounds: number, reps: number, dir: 1 | -1) {
  const per = repsPerRound(part, sex)
  if (per <= 0) return { rounds, reps: Math.max(0, reps + dir) }
  if (dir > 0) {
    const pos = amrapPosition(part, sex, reps)
    const next = reps + (pos ? Math.min(tapStep(pos.movement), pos.need - pos.done) : 1)
    return next >= per ? { rounds: rounds + 1, reps: 0 } : { rounds, reps: next }
  }
  let r = rounds, x = reps
  if (x === 0) { if (r === 0) return { rounds: 0, reps: 0 }; r -= 1; x = per }
  const pos = amrapPosition(part, sex, x - 1)
  return { rounds: r, reps: Math.max(0, x - (pos ? Math.min(tapStep(pos.movement), pos.done + 1) : 1)) }
}

/** Max-load completeness needs to know who lifts: every athlete × lift (or every lift for the pair). */
export function loadComplete(part: WorkoutPart, athleteIds: string[], entries: LoadEntries) {
  const owners = part.load_entry === 'per_team' ? ['pair'] : athleteIds
  return owners.every((o) => part.part_movements.every((m) => entries.lifts[o]?.[m.id!] != null))
}

// ── Admin edits and paper scores ───────────────────────────────────────────────
// The admin types results the way they're written on a scoresheet; we rebuild real entries
// so the score is calculated exactly like a judge's.

export interface AdminInput { rounds: string[]; amrapRounds: string; amrapReps: string; reps: string; kg: string; value: string }

/** "2:41.5" / "161.5" → time in seconds; "cap 28" / "c28" → capped with 28 reps done. */
export function parseRoundInput(text: string): { time: number } | { cappedReps: number } | null {
  const t = text.trim().toLowerCase()
  if (!t) return null
  const cap = t.match(/^c(?:ap)?\s*\+?\s*(\d+)$/)
  if (cap) return { cappedReps: Number(cap[1]) }
  if (t.includes(':')) {
    const [m, s] = t.split(':')
    const sec = Number(m) * 60 + Number(s)
    return Number.isFinite(sec) && Number(s) < 60 ? { time: Math.round(sec * 10) / 10 } : null
  }
  const n = Number(t)
  return Number.isFinite(n) ? { time: Math.round(n * 10) / 10 } : null
}

export function entriesFromAdmin(part: WorkoutPart, sex: Sex, input: AdminInput): { entries: Entries } | { error: string } {
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  switch (part.score_type) {
    case 'for_time': {
      const n = Math.max(1, part.rounds || 1)
      const rounds: RoundEntry[] = []
      for (let i = 0; i < n; i++) {
        const parsed = parseRoundInput(input.rounds[i] ?? '')
        const name = n > 1 ? `Round ${i + 1}` : 'Time'
        if (!parsed) return { error: `${name}: enter a time like 2:41.5, or “cap 28” if they didn’t finish.` }
        if ('time' in parsed) {
          if (part.time_cap_seconds != null && parsed.time > part.time_cap_seconds) return { error: `${name}: ${formatTime(parsed.time)} is over the ${formatTime(part.time_cap_seconds, false)} cap. Use “cap <reps>” instead.` }
          rounds.push({ started_at: null, ticks: part.part_movements.map((m) => ({ movement_id: m.id!, at: parsed.time })), capped: false, partial_reps: null })
        } else {
          let left = parsed.cappedReps
          const ticks: Tick[] = []
          let partial = 0
          for (const m of part.part_movements) {
            const r = repsFor(m, sex)
            if (left >= r && ticks.length < part.part_movements.length - 1) { ticks.push({ movement_id: m.id!, at: part.time_cap_seconds ?? 0 }); left -= r }
            else { partial = Math.min(left, Math.max(0, r - 1)); break }
          }
          rounds.push({ started_at: null, ticks, capped: true, partial_reps: partial, confirmed: true })
        }
      }
      return { entries: { kind: 'for_time', rounds } }
    }
    case 'amrap': {
      const r = num(input.amrapRounds), x = num(input.amrapReps)
      if (r == null || x == null || !Number.isFinite(r) || !Number.isFinite(x)) return { error: 'Enter full rounds and extra reps.' }
      return { entries: { kind: 'amrap', rounds: r, reps: x } }
    }
    case 'max_reps': {
      const r = num(input.reps)
      if (r == null || !Number.isFinite(r)) return { error: 'Enter the total reps.' }
      return { entries: { kind: 'max_reps', reps: r } }
    }
    case 'max_load': {
      const kg = num(input.kg)
      if (kg == null || !Number.isFinite(kg)) return { error: 'Enter the total load in kg.' }
      return { entries: { kind: 'max_load', lifts: { admin: { total: kg } } } }
    }
    default: {
      const v = num(input.value)
      if (v == null || !Number.isFinite(v)) return { error: 'Enter the score.' }
      return { entries: { kind: 'other', value: v } }
    }
  }
}

/** Pre-fills the admin form from an existing score. */
export function adminInputFrom(part: WorkoutPart, sex: Sex, entries: Entries | null): AdminInput {
  const blank: AdminInput = { rounds: Array.from({ length: Math.max(1, part.rounds || 1) }, () => ''), amrapRounds: '', amrapReps: '', reps: '', kg: '', value: '' }
  if (!entries) return blank
  switch (entries.kind) {
    case 'for_time':
      return { ...blank, rounds: blank.rounds.map((_, i) => {
        const r = entries.rounds[i]
        if (!r) return ''
        const v = roundValue(part, sex, r)
        if (v.value == null) return ''
        return v.capped ? `cap ${cappedRoundReps(part, sex, r)}` : formatTime(v.value)
      }) }
    case 'amrap': return { ...blank, amrapRounds: entries.rounds?.toString() ?? '', amrapReps: entries.reps?.toString() ?? '' }
    case 'max_reps': return { ...blank, reps: entries.reps?.toString() ?? '' }
    case 'max_load': { const v = computeScore(part, sex, entries).value; return { ...blank, kg: v?.toString() ?? '' } }
    default: return { ...blank, value: entries.value?.toString() ?? '' }
  }
}
