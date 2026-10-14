// Leaderboard engine. Pure functions — the public site, TV screen and admin preview all use it.
//
// 1. Events: every scored part is an event (Event 3A, 3B…), unless the workout combines its
//    scored parts, in which case the workout is one event and the part values are added.
// 2. Each event is ranked per division by value (lowest or highest wins), then tiebreak.
//    Equal results share a place (1, 2, 2, 4). Teams with no verified score in a released
//    event share the place after the last scored team.
// 3. Places become points (placing / reverse / custom) and are totalled. Overall ties are
//    split by the better place in the most recent event; still level = shared rank.
import { computeScore, formatTime, type Entries, type Sex } from './scoring'
import { pointsFor, lowerTotalWins } from './points'
import { partTitle, type PointsMethod, type WorkoutPart } from './types'

export interface RankWorkout { id: string; number: number; name: string; combine_parts: boolean; parts: (WorkoutPart & { id: string })[] }
export interface RankScore { part_id: string; team_id: string; value: number | null; tiebreak_value: number | null; capped: boolean; entries: Entries | Record<string, never> }
export interface RankTeam { id: string; name: string; division_id: string }
export interface RankDivision { id: string; name: string; sex: Sex }
export interface Release { part_id: string; division_id: string; released_at?: string }

export interface RankEvent {
  key: string // part id, or workout id when combined
  label: string // "1", "3A"
  title: string // "Five Alive", "Heavy Pair · Part A"
  workout: RankWorkout
  parts: (WorkoutPart & { id: string })[]
  lowerWins: boolean
  lowerTiebreakWins: boolean
}

export interface EventResult { place: number | null; points: number; display: string; value: number | null; scored: boolean }
export interface Standing {
  team: RankTeam
  rank: number
  total: number
  results: Record<string, EventResult> // by event key
}

export function buildEvents(workouts: RankWorkout[]): RankEvent[] {
  const events: RankEvent[] = []
  for (const w of [...workouts].sort((a, b) => a.number - b.number)) {
    const scored = [...w.parts].filter((p) => p.scored).sort((a, b) => a.sort_order - b.sort_order)
    if (!scored.length) continue
    const lowerTiebreakWins = (p: WorkoutPart) => p.score_type !== 'max_load'
    if (w.combine_parts && scored.length > 1) {
      events.push({ key: w.id, label: String(w.number), title: w.name, workout: w, parts: scored, lowerWins: scored[0].direction === 'asc', lowerTiebreakWins: lowerTiebreakWins(scored[0]) })
    } else {
      scored.forEach((p, i) => {
        const multi = scored.length > 1
        // a typed letter gives "3A"; with no letter, several parts become "3.1", "3.2"
        const suffix = p.label.trim() || (multi ? `.${i + 1}` : '')
        const title = partTitle(p)
        events.push({
          key: p.id,
          label: multi ? `${w.number}${suffix}` : String(w.number),
          title: multi && title ? `${w.name} · ${title}` : w.name,
          workout: w, parts: [p], lowerWins: p.direction === 'asc', lowerTiebreakWins: lowerTiebreakWins(p),
        })
      })
    }
  }
  return events
}

/** An event counts for a division once every one of its parts is released for that division. */
export function isReleased(event: RankEvent, divisionId: string, releases: Release[]) {
  return event.parts.every((p) => releases.some((r) => r.part_id === p.id && r.division_id === divisionId))
}

function eventValue(event: RankEvent, teamId: string, scores: RankScore[], sex: Sex): { value: number | null; tiebreak: number | null; display: string } {
  const own = event.parts.map((p) => scores.find((s) => s.part_id === p.id && s.team_id === teamId))
  if (own.some((s) => !s || s.value == null)) return { value: null, tiebreak: null, display: '—' }
  if (event.parts.length === 1) {
    const s = own[0]!
    const entries = s.entries && 'kind' in s.entries ? (s.entries as Entries) : null
    const display = entries ? computeScore(event.parts[0], sex, entries).display : formatValue(event.parts[0], Number(s.value))
    return { value: Number(s.value), tiebreak: s.tiebreak_value != null ? Number(s.tiebreak_value) : null, display }
  }
  const value = Math.round(own.reduce((n, s) => n + Number(s!.value), 0) * 10) / 10
  return { value, tiebreak: null, display: formatValue(event.parts[0], value) }
}

export function formatValue(part: Pick<WorkoutPart, 'score_type' | 'unit'>, value: number) {
  switch (part.score_type) {
    case 'for_time': return formatTime(value)
    case 'max_load': return `${value} kg`
    case 'max_reps': return `${value} reps`
    case 'amrap': return `${value} reps`
    default: return `${value}${part.unit ? ' ' + part.unit : ''}`
  }
}

export function rankEvent(event: RankEvent, teams: RankTeam[], scores: RankScore[], sex: Sex, method: PointsMethod, custom: number[]) {
  const rows = teams.map((t) => ({ team: t, ...eventValue(event, t.id, scores, sex) }))
  const scored = rows.filter((r) => r.value != null)
  const cmp = (a: typeof rows[number], b: typeof rows[number]) => {
    const d = event.lowerWins ? a.value! - b.value! : b.value! - a.value!
    if (d !== 0) return d
    if (a.tiebreak != null && b.tiebreak != null && a.tiebreak !== b.tiebreak) return event.lowerTiebreakWins ? a.tiebreak - b.tiebreak : b.tiebreak - a.tiebreak
    return 0
  }
  scored.sort(cmp)
  const out = new Map<string, EventResult>()
  scored.forEach((r, i) => {
    const prev = scored[i - 1]
    const place = i > 0 && cmp(prev, r) === 0 ? out.get(prev.team.id)!.place! : i + 1
    out.set(r.team.id, { place, points: pointsFor(method, place, teams.length, custom), display: r.display, value: r.value, scored: true })
  })
  const lastPlace = scored.length + 1
  for (const r of rows) {
    if (!out.has(r.team.id)) out.set(r.team.id, { place: lastPlace, points: pointsFor(method, lastPlace, teams.length, custom), display: '—', value: null, scored: false })
  }
  return out
}

export function divisionStandings(opts: {
  division: RankDivision; teams: RankTeam[]; events: RankEvent[]; scores: RankScore[]; releases: Release[] | 'all'
  method: PointsMethod; custom: number[]
}): { events: RankEvent[]; standings: Standing[] } {
  const teams = opts.teams.filter((t) => t.division_id === opts.division.id)
  const events = opts.releases === 'all' ? opts.events : opts.events.filter((e) => isReleased(e, opts.division.id, opts.releases as Release[]))
  const perEvent = events.map((e) => rankEvent(e, teams, opts.scores, opts.division.sex, opts.method, opts.custom))
  const lowerTotal = lowerTotalWins(opts.method)

  const standings: Standing[] = teams.map((team) => {
    const results: Record<string, EventResult> = {}
    events.forEach((e, i) => { results[e.key] = perEvent[i].get(team.id)! })
    const total = Object.values(results).reduce((n, r) => n + r.points, 0)
    return { team, rank: 0, total, results }
  })

  const cmp = (a: Standing, b: Standing) => {
    const d = lowerTotal ? a.total - b.total : b.total - a.total
    if (d !== 0) return d
    // overall tiebreak: better place in the most recent event, then the one before…
    for (let i = events.length - 1; i >= 0; i--) {
      const pa = a.results[events[i].key]?.place ?? 999
      const pb = b.results[events[i].key]?.place ?? 999
      if (pa !== pb) return pa - pb
    }
    return 0
  }
  standings.sort((a, b) => cmp(a, b) || a.team.name.localeCompare(b.team.name))
  standings.forEach((s, i) => { s.rank = i > 0 && cmp(standings[i - 1], s) === 0 ? standings[i - 1].rank : i + 1 })
  return { events, standings }
}
