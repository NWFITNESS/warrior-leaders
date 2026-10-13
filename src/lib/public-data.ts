import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { buildEvents, divisionStandings, type RankScore, type RankWorkout, type Release } from './ranking'
import type { Sex } from './scoring'
import type { PointsMethod } from './types'

// Public pages read through SECURITY DEFINER functions that return only
// non-sensitive columns (no emails or phone numbers). Uses the anon key —
// no service-role key is needed anywhere in this app.
function anon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function getPublicSettings() {
  const { data } = await anon().rpc('wl_public_settings')
  return data as { name: string; event_date: string; venue: string } | null
}

export interface PublicTeam {
  id: string
  name: string
  bib: number | null
  division_id: string
  athletes: { first_name: string; last_name: string; position: number }[]
}

export async function getPublicTeams() {
  const { data } = await anon().rpc('wl_public_teams')
  const result = (data ?? { divisions: [], teams: [] }) as { divisions: { id: string; name: string }[]; teams: PublicTeam[] }
  return result
}

// ── Week 3: leaderboard + schedule ─────────────────────────────────────────────

export interface PublicBoard {
  settings: { name: string; event_date: string; venue: string; points_method: PointsMethod; custom_points: number[]; overall_tiebreak: string }
  divisions: { id: string; name: string; sex: Sex; level: string }[]
  teams: { id: string; name: string; division_id: string; athletes: { first_name: string; last_name: string }[] }[]
  workouts: RankWorkout[]
  releases: Release[]
  scores: RankScore[]
}

export async function getBoardData() {
  const { data } = await anon().rpc('wl_public_leaderboard')
  return data as PublicBoard | null
}

/** Serializable standings for every division (released events only). */
export function computeBoards(board: PublicBoard) {
  const events = buildEvents(board.workouts)
  const custom = board.settings.custom_points ?? []
  return board.divisions.map((d) => {
    const { events: shown, standings } = divisionStandings({
      division: d, teams: board.teams, events, scores: board.scores, releases: board.releases,
      method: board.settings.points_method, custom,
    })
    return {
      division: { id: d.id, name: d.name },
      events: shown.map((e) => ({ key: e.key, label: e.label, title: e.title })),
      rows: standings.map((s) => ({
        teamId: s.team.id,
        team: s.team.name,
        athletes: board.teams.find((t) => t.id === s.team.id)?.athletes.map((a) => `${a.first_name} ${a.last_name}`.trim()).join(' & ') ?? '',
        rank: s.rank,
        total: s.total,
        results: Object.fromEntries(Object.entries(s.results).map(([k, r]) => [k, { place: r.place, points: r.points, display: r.display, scored: r.scored }])),
      })),
    }
  })
}
export type DivisionBoard = ReturnType<typeof computeBoards>[number]

export interface ScheduleHeat {
  workout_id: string; workout_number: number; workout_name: string; heat_id: string; heat_number: number; start_time: string | null
  lanes: { lane: number; team_id: string; team_name: string; division: string }[]
}
export async function getSchedule() {
  const { data } = await anon().rpc('wl_public_schedule')
  return (data ?? []) as ScheduleHeat[]
}
