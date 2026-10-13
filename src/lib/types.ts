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
  rx_load: string | null
  scaled_load: string | null
  standards: string | null
}

export interface WorkoutPart {
  id?: string
  label: string
  name: string
  sort_order: number
  score_type: ScoreType
  direction: Direction
  time_cap_seconds: number | null
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
