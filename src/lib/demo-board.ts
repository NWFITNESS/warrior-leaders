import 'server-only'
import type { PublicBoard } from './public-data'
import type { WorkoutPart } from './types'

// Made-up results for /demo: fictional teams, run through the real ranking engine,
// so you can see a full leaderboard before the day. Never written to the database.

type Part = WorkoutPart & { id: string }
const mv = (id: string, name: string, reps: number | null, rx: string | null, scaled: string | null, extra: Partial<Part['part_movements'][number]> = {}) =>
  ({ id, sort_order: 0, name, reps, reps_female: null, rx_load: rx, scaled_load: scaled, standards: null, ...extra })
const part = (id: string, p: Partial<Part>): Part => ({
  id, label: '', name: '', sort_order: 0, score_type: 'for_time', direction: 'asc', time_cap_seconds: null, rounds: 1,
  capped_round_rule: 'cap_plus_reps', total_reps: null, unit: '', load_entry: 'per_athlete', scored: true,
  tiebreak_note: null, notes: null, part_movements: [], ...p,
})

const WORKOUTS: PublicBoard['workouts'] = [
  { id: 'w1', number: 1, name: 'Rinse & Repeat', combine_parts: false, description: '- 4 rounds, each in a 3-minute window. Rest for the remaining time.',
    parts: [part('p1', { rounds: 4, time_cap_seconds: 180, tiebreak_note: 'fastest round', part_movements: [
      mv('m11', 'Echo bike (cal)', 21, null, null, { reps_female: 18, scaled_reps: 18, scaled_reps_female: 15 }), mv('m12', 'Deadlifts', 15, '80/60kg', '60/42.5kg'), mv('m13', 'Synchro burpee pull-ups', 9, null, null, { scaled_name: 'Synchro double tap burpees' })] })] },
  { id: 'w2', number: 2, name: 'Iron Bargain', combine_parts: false, description: '- 2A and 2B share one 6-minute window.\n- Failed lifts don’t count.',
    parts: [
      part('p2a', { label: 'A', name: 'For time', time_cap_seconds: 360, tiebreak_note: 'time at the end of the first double unders', part_movements: [
        mv('m21', 'Synchronised shoulder to overhead', 20, '50/35kg', '40/25kg'), mv('m22', 'Double unders', 60, null, null, { scaled_name: 'Single unders', scaled_reps: 100 }),
        mv('m23', 'Synchronised overhead squats', 20, '50/35kg', '40/25kg'), mv('m24', 'Double unders', 60, null, null, { scaled_name: 'Single unders', scaled_reps: 100 }), mv('m25', 'Synchronised thrusters', 20, '50/35kg', '40/25kg')] }),
      part('p2b', { label: 'B', name: '1RM Clean & Snatch', sort_order: 1, score_type: 'max_load', direction: 'desc', load_entry: 'per_team', part_movements: [mv('m26', 'Clean (Partner 1)', null, null, null), mv('m27', 'Snatch (Partner 2)', null, null, null)] }),
    ] },
  { id: 'w3', number: 3, name: 'The Gauntlet', combine_parts: false, description: '- All movements in the prescribed order.\n- Capped teams are ranked by total reps.',
    parts: [part('p3', { time_cap_seconds: 900, tiebreak_note: 'time at the end of the handstand push-ups', part_movements: [
      mv('m31', 'Bike erg (cal)', 30, null, null, { reps_female: 25 }), mv('m32', 'Synchronised toes to bar', 30, null, null, { scaled_name: 'Synchronised knee raises' }),
      mv('m33', 'Handstand push-ups', 30, null, '24" box + 1 AbMat', { scaled_name: 'Box pike push-ups', scaled_reps: 20 }), mv('m34', 'Synchronised box jump overs', 30, '24/20"', null, { scaled_name: 'Synchronised box step overs' }),
      mv('m35', 'Single dumbbell devil’s press', 30, '22.5/15kg', '15/10kg'), mv('m36', 'Bike erg (cal)', 30, null, null, { reps_female: 25 })] })] },
  { id: 'w4', number: 4, name: 'The Siege', combine_parts: false, open_entry: true, description: '- Side event: teams do it whenever they like.\n- One athlete works at a time.',
    parts: [part('p4', { score_type: 'max_reps', direction: 'desc', time_cap_seconds: 120, part_movements: [mv('m41', 'Sandbag over the barrier', null, '60/40kg', '40/30kg')] })] },
]

const DIVISIONS: PublicBoard['divisions'] = [
  { id: 'rxm', name: 'RX Male', sex: 'male', level: 'rx' }, { id: 'rxf', name: 'RX Female', sex: 'female', level: 'rx' },
  { id: 'scm', name: 'Scaled Male', sex: 'male', level: 'scaled' }, { id: 'scf', name: 'Scaled Female', sex: 'female', level: 'scaled' },
]
const NAMES: Record<string, string[]> = {
  rxm: ['Barbell Brothers', 'Clean Machines', 'Snatch Squad', 'Two Tonne Titans', 'Grip It & Rip It', 'Chalk & Awe', 'Thrust Issues', 'Burpee Bandits'],
  rxf: ['Lift Like a Girl', 'Squat Goals', 'Wall Ball Warriors', 'Dumbbell Divas', 'Toes & Tiaras', 'Iron Sisters', 'Rowing Rebels', 'Kettlebelles'],
  scm: ['Sweat Equity', 'Rep It Out', 'Mostly Harmless', 'Box Jump Buddies', 'Cardio Kings', 'The Plateaus', 'Beard & Barbell', 'Couch to Comp'],
  scf: ['Prosecco & PBs', 'Sweaty Bettys', 'Gym Sisters', 'Plank You Next', 'Squatty Potty', 'Lunge Lovers', 'Glute Squad', 'Wobbly Knees'],
}
const FIRST = { male: ['Tom', 'Jack', 'Liam', 'Ben', 'Sam', 'Josh', 'Dan', 'Matt', 'Ryan', 'Chris'], female: ['Amy', 'Lucy', 'Emma', 'Sophie', 'Katie', 'Hannah', 'Chloe', 'Jess', 'Megan', 'Laura'] }
const LAST = ['Smith', 'Jones', 'Taylor', 'Brown', 'Walker', 'Wright', 'Hughes', 'Clarke', 'Hall', 'Wood', 'Ward', 'Turner']

// small deterministic random so the demo looks the same every visit
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 } }

export function demoBoard(): PublicBoard {
  const rand = rng(7)
  const between = (a: number, b: number) => a + rand() * (b - a)
  const teams: PublicBoard['teams'] = []
  const scores: PublicBoard['scores'] = []
  for (const d of DIVISIONS) {
    const sex = d.sex as 'male' | 'female'
    NAMES[d.id].forEach((name, i) => {
      const id = `${d.id}-${i}`
      const pick = (arr: string[]) => arr[Math.floor(rand() * arr.length)]
      teams.push({ id, name, division_id: d.id, athletes: [0, 1].map(() => ({ first_name: pick(FIRST[sex]), last_name: pick(LAST) })) })
      const s = (part_id: string, value: number, tiebreak: number | null = null) =>
        scores.push({ part_id, team_id: id, value: Math.round(value * 10) / 10, tiebreak_value: tiebreak, capped: false, entries: {} as never })
      const heavy = d.level === 'rx' ? (sex === 'male' ? 1 : 0.68) : (sex === 'male' ? 0.75 : 0.5)
      // times stay under each cap (real capped scores show as "CAP · reps", which needs the judge's entries)
      s('p1', between(560, 712), between(128, 175))
      s('p2a', between(230, 358), between(70, 140))
      s('p2b', Math.round(between(150, 240) * heavy / 2.5) * 2.5)
      s('p3', between(600, 898), between(260, 520))
      s('p4', Math.floor(between(13, 31)))
    })
  }
  // everything released, except Event 4 for Scaled Female (so you can see a not-yet-released event)
  const releases = DIVISIONS.flatMap((d) => ['p1', 'p2a', 'p2b', 'p3', 'p4'].filter((p) => !(p === 'p4' && d.id === 'scf')).map((p) => ({ part_id: p, division_id: d.id })))
  return {
    settings: { name: 'Warrior Leaders', event_date: '2026-11-07', venue: 'Northern Warrior', points_method: 'placing', custom_points: [], overall_tiebreak: '' },
    divisions: DIVISIONS, teams, workouts: WORKOUTS, releases, scores,
  }
}
