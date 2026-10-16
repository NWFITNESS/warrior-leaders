// Live race screen: turns the judges' working copy of each lane into progress.
// Shared by /live; uses the same scoring code as the judge app so the bar matches the phone.
import {
  amrapPosition, cappedRoundReps, computeScore, formatTime, repsFor, repsPerRound,
  type Entries, type RoundEntry, type Sex,
} from './scoring'
import { partTitle, resolvePart, type Level, type WorkoutPart } from './types'

export interface LiveLane { lane: number; lane_assignment_id: string; team_id: string; team_name: string; division: string; level: Level; sex: Sex }
export interface LiveHeat { id: string; number: number; start_time: string | null; workout_id: string; workout_number: number; workout_name: string; lanes: LiveLane[] }
export interface LiveProgress { lane_assignment_id: string; part_id: string; status: string; value: number | null; capped: boolean; entries: Entries | Record<string, never>; updated_at: string }
export interface LiveData {
  name: string
  heat_id: string | null
  pinned: boolean
  heats: LiveHeat[]
  parts: (WorkoutPart & { id: string })[]
  progress: LiveProgress[]
}

export interface LaneState {
  lane: LiveLane
  started: boolean
  finished: boolean
  /** 0–1 along the track. For open-ended scores (AMRAP, max reps, load) it's relative to the heat leader. */
  fraction: number
  amount: number // reps done (or kg / value) — used to order the race
  now: string // what they're on: "R2 · 8/15 Deadlift"
  result: string // finish time / score once done, else the running amount
  capped: boolean
  value: number | null
  runningSince: number | null // epoch ms the judge started this lane's current round
  place: number | null
}

const isEntries = (e: LiveProgress['entries'] | undefined): e is Entries => !!e && 'kind' in e

function currentRound(rounds: RoundEntry[], movements: number) {
  return rounds.findIndex((r) => !(movements && r.ticks.length >= movements) && !(r.capped && r.partial_reps != null && r.confirmed))
}

/** The part the heat is working on: the one the judges touched last (else the first scored part). */
export function activePart(data: LiveData) {
  const latest = [...data.progress].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  return data.parts.find((p) => p.id === latest?.part_id) ?? data.parts.find((p) => p.scored) ?? data.parts[0] ?? null
}

export function laneStates(heat: LiveHeat, rawPart: WorkoutPart & { id: string }, progress: LiveProgress[]): LaneState[] {
  const states = heat.lanes.map((lane): LaneState => {
    const part = resolvePart(rawPart, lane.level)
    const row = progress.find((p) => p.lane_assignment_id === lane.lane_assignment_id && p.part_id === rawPart.id)
    const entries = isEntries(row?.entries) ? row.entries : null
    const base: LaneState = { lane, started: false, finished: false, fraction: 0, amount: 0, now: 'Ready', result: '', capped: false, value: null, runningSince: null, place: null }
    if (!entries) return base
    const score = computeScore(part, lane.sex, entries)
    const done = score.complete || row?.status === 'submitted' || row?.status === 'verified' || row?.status === 'appeal'

    if (entries.kind === 'for_time') {
      const mv = part.part_movements
      const per = repsPerRound(part, lane.sex)
      const total = per * entries.rounds.length
      let reps = 0
      entries.rounds.forEach((r) => {
        if (mv.length && r.ticks.length >= mv.length) reps += per
        else if (r.capped && r.partial_reps != null) reps += cappedRoundReps(part, lane.sex, r)
        else if (r.started_at) reps += cappedRoundReps(part, lane.sex, { ...r, partial_reps: r.reps_done ?? 0 })
      })
      const ri = currentRound(entries.rounds, mv.length)
      const r = ri >= 0 ? entries.rounds[ri] : null
      const multi = entries.rounds.length > 1
      let now = done ? (score.capped ? 'Time capped' : 'Finished') : 'Ready'
      if (!done && r?.started_at) {
        const m = mv[r.ticks.length]
        now = r.capped ? 'Time’s up' : m ? `${r.reps_done ?? 0}/${repsFor(m, lane.sex)} ${m.name}` : 'Finishing'
      }
      if (!done && r && !r.started_at && ri > 0) now = `Rest · next R${ri + 1}`
      if (multi && !done && r) now = `R${ri + 1} · ${now}`
      return {
        ...base,
        started: entries.rounds.some((x) => x.started_at || x.ticks.length),
        finished: done,
        fraction: total ? Math.min(1, done && !score.capped ? 1 : reps / total) : done ? 1 : 0,
        amount: reps,
        now,
        result: done ? score.display : `${reps} reps`,
        capped: score.capped,
        value: score.value,
        runningSince: r?.started_at && !r.capped ? r.started_at : null,
      }
    }

    if (entries.kind === 'amrap') {
      const per = repsPerRound(part, lane.sex)
      const rounds = entries.rounds ?? 0, reps = entries.reps ?? 0
      const amount = per ? rounds * per + reps : rounds * 1000 + reps
      const pos = per ? amrapPosition(part, lane.sex, reps) : null
      return {
        ...base, started: amount > 0, finished: done, amount, value: score.value,
        now: done ? 'Finished' : pos ? `R${rounds + 1} · ${pos.done}/${pos.need} ${pos.movement.name}` : `${rounds} rds`,
        result: `${rounds} rds + ${reps}`,
      }
    }

    const amount = score.value ?? 0
    return { ...base, started: score.value != null, finished: done, amount, value: score.value, now: done ? 'Finished' : '', result: score.display }
  })

  // Order of the race + track position for open-ended scores (relative to the leader)
  const lowerWins = rawPart.score_type === 'for_time' || rawPart.direction === 'asc'
  const timeBased = rawPart.score_type === 'for_time'
  if (!timeBased) {
    const best = Math.max(0, ...states.map((s) => s.amount))
    const worst = Math.min(...states.map((s) => s.amount))
    states.forEach((s) => {
      if (!s.started) return
      s.fraction = best <= 0 ? 0 : lowerWins ? (worst > 0 ? worst / Math.max(s.amount, 1e-9) : 0) : s.amount / best
    })
  }
  const ranked = states.filter((s) => s.started).sort((a, b) => {
    if (timeBased) {
      const af = a.finished && a.value != null, bf = b.finished && b.value != null
      if (af && bf) return a.value! - b.value!
      if (af !== bf) return af ? -1 : 1
      return b.amount - a.amount
    }
    return lowerWins ? a.amount - b.amount : b.amount - a.amount
  })
  ranked.forEach((s, i) => {
    const prev = ranked[i - 1]
    const tie = prev && (timeBased ? prev.finished === s.finished && (s.finished ? prev.value === s.value : prev.amount === s.amount) : prev.amount === s.amount)
    s.place = tie ? prev.place : i + 1
  })
  return states
}

/** Heat clock: from the first lane whose judge started the current round. */
export function heatClock(states: LaneState[]) {
  const starts = states.map((s) => s.runningSince).filter((x): x is number => x != null)
  return starts.length ? Math.min(...starts) : null
}

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : 'TBC')
export { formatTime, partTitle }
