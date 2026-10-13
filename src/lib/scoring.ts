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

/** Max-load completeness needs to know who lifts: every athlete × lift (or every lift for the pair). */
export function loadComplete(part: WorkoutPart, athleteIds: string[], entries: LoadEntries) {
  const owners = part.load_entry === 'per_team' ? ['pair'] : athleteIds
  return owners.every((o) => part.part_movements.every((m) => entries.lifts[o]?.[m.id!] != null))
}
