export type PointsMethod = 'placing' | 'reverse' | 'custom'
export type ScoreType = 'for_time' | 'amrap' | 'max_reps' | 'max_load' | 'other'
export type Direction = 'asc' | 'desc'

export interface Settings {
  id: number
  name: string
  event_date: string
  venue: string
  points_method: PointsMethod
  custom_points: number[]
  lanes_per_heat: number
  judge_code: string
  overall_tiebreak: string
}

export interface Division {
  id: string
  name: string
  level: 'rx' | 'scaled'
  sex: 'male' | 'female' | 'mixed'
  sort_order: number
}

export interface Athlete {
  id: string
  team_id: string
  position: number
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  is_captain: boolean
}

export interface Team {
  id: string
  division_id: string
  name: string
  bib: number | null
  notes: string | null
  athletes?: Athlete[]
}

export interface Movement {
  id?: string
  sort_order: number
  name: string
  reps: number | null
  reps_female: number | null // null = same as reps (female divisions)
  rx_load: string | null
  scaled_load: string | null
  standards: string | null
  // Scaled version — null/blank = same as RX
  scaled_name?: string | null
  scaled_reps?: number | null
  scaled_reps_female?: number | null
  scaled_standards?: string | null
}

export interface WorkoutPart {
  id?: string
  label: string
  name: string
  sort_order: number
  score_type: ScoreType
  direction: Direction
  time_cap_seconds: number | null
  rounds: number // for_time: N timed windows of time_cap_seconds; score = sum of window times
  capped_round_rule: 'cap_plus_reps' | 'cap_only'
  total_reps: number | null
  unit: string | null
  load_entry: 'per_athlete' | 'per_team'
  scored: boolean
  tiebreak_note: string | null
  notes: string | null
  part_movements: Movement[]
}

export interface Workout {
  id: string
  number: number
  name: string
  description: string | null
  combine_parts: boolean
  status: 'draft' | 'ready' | 'live' | 'complete'
  workout_parts?: WorkoutPart[]
}

export interface Judge {
  id: string
  name: string
  role: 'head' | 'lane'
  phone: string | null
  email: string | null
  active: boolean
}

export const SCORE_TYPES: { value: ScoreType; label: string; defaultDirection: Direction }[] = [
  { value: 'for_time', label: 'For time', defaultDirection: 'asc' },
  { value: 'amrap', label: 'AMRAP', defaultDirection: 'desc' },
  { value: 'max_reps', label: 'Max reps', defaultDirection: 'desc' },
  { value: 'max_load', label: 'Max load', defaultDirection: 'desc' },
  { value: 'other', label: 'Other', defaultDirection: 'desc' },
]

export function scoreTypeLabel(t: ScoreType) {
  return SCORE_TYPES.find((s) => s.value === t)?.label ?? t
}

export function formatCap(seconds: number | null) {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function parseCap(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (t.includes(':')) {
    const [m, s] = t.split(':')
    const total = Number(m) * 60 + Number(s || 0)
    return Number.isFinite(total) ? total : null
  }
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 60) : null // bare number = minutes
}

/**
 * How a part is named on screen. "Part A" only if a letter was typed in the builder;
 * otherwise just its name; otherwise nothing (null). Never invents a letter.
 */
export function partTitle(p: { label: string; name: string }): string | null {
  const label = p.label.trim()
  const name = p.name.trim()
  if (label && name) return `Part ${label} · ${name}`
  if (label) return `Part ${label}`
  return name || null
}

/** For places that must show something (tabs, headings) when a workout has several unnamed parts. */
export function partTitleOr(p: { label: string; name: string }, index: number): string {
  return partTitle(p) ?? `Part ${index + 1}`
}

export type Level = 'rx' | 'scaled'

/**
 * The version of a movement a team actually does. For Scaled teams every blank Scaled field
 * falls back to RX. Female Scaled reps: the Scaled female figure, else the Scaled reps,
 * else the RX female reps. The movement id is unchanged, so ticks and scores still line up.
 * The resolved load is returned in rx_load (so callers read one field).
 */
export function resolveMovement<M extends Movement>(m: M, level: Level | string): M {
  if (level !== 'scaled') return m
  const blank = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v)
  const reps = m.scaled_reps ?? m.reps
  const repsFemale = m.scaled_reps_female ?? (m.scaled_reps != null ? m.scaled_reps : m.reps_female)
  return {
    ...m,
    name: blank(m.scaled_name) ?? m.name,
    reps,
    reps_female: repsFemale,
    rx_load: blank(m.scaled_load) ?? m.rx_load,
    standards: blank(m.scaled_standards) ?? m.standards,
  }
}

export function resolvePart<P extends { part_movements: Movement[] }>(p: P, level: Level | string): P {
  return level === 'scaled' ? { ...p, part_movements: p.part_movements.map((m) => resolveMovement(m, level)) } : p
}

/** True when a movement's Scaled version differs from RX in any way. */
export function hasScaledVersion(m: Movement) {
  const set = (v: string | null | undefined) => v != null && v.trim() !== ''
  return set(m.scaled_name) || m.scaled_reps != null || m.scaled_reps_female != null || set(m.scaled_load) || set(m.scaled_standards)
}

/** "21/18 Echo bike (cal) · 60/40kg" for a movement (pass it through resolveMovement for Scaled). */
export function describeMovement(m: Movement) {
  const reps = m.reps != null ? `${m.reps}${m.reps_female != null && m.reps_female !== m.reps ? `/${m.reps_female}` : ''} ` : ''
  return `${reps}${m.name}${m.rx_load ? ` · ${m.rx_load}` : ''}`
}
