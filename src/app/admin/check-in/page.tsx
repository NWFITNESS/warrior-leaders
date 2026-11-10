import { requireEvent } from '@/lib/event'
import { CheckIn, type CheckInTeam } from './check-in'

export const metadata = { title: 'Check-in', manifest: '/check-in.webmanifest', appleWebApp: { capable: true, title: 'WL Check-in', statusBarStyle: 'black-translucent' as const } }
export const dynamic = 'force-dynamic'

/** Morning registration on a tablet: search a team, tap each athlete as they arrive. */
export default async function CheckInPage() {
  const { supabase, event } = await requireEvent()
  const [{ data: teams }, { data: lanes }, { data: settings }] = await Promise.all([
    supabase.from('wl_teams').select('id, name, division:wl_divisions(name, level, sex, sort_order), athletes:wl_athletes(id, first_name, last_name, position, is_captain, checked_in_at)').eq('competition_id', event.id).order('name'),
    supabase.from('wl_lane_assignments').select('lane, team_id, heat:wl_heats(number, start_time, workout:wl_workouts(number, name, open_entry))'),
    Promise.resolve({ data: { competition_name: event.name } }),
  ])

  type Lane = { lane: number; team_id: string; heat: { number: number; start_time: string | null; workout: { number: number; name: string; open_entry: boolean } } }
  const firstHeat = (teamId: string) => ((lanes ?? []) as unknown as Lane[])
    .filter((l) => l.team_id === teamId && !l.heat.workout.open_entry && l.heat.start_time)
    .sort((a, b) => a.heat.start_time!.localeCompare(b.heat.start_time!))[0]

  const list: CheckInTeam[] = ((teams ?? []) as unknown as {
    id: string; name: string; division: { name: string; level: string; sex: string; sort_order: number }
    athletes: { id: string; first_name: string; last_name: string; position: number; is_captain: boolean; checked_in_at: string | null }[]
  }[]).map((t) => {
    const fh = firstHeat(t.id)
    return {
      id: t.id, name: t.name, division: t.division.name, level: t.division.level, divisionOrder: t.division.sort_order,
      firstHeat: fh ? { time: fh.heat.start_time!.slice(0, 5), event: fh.heat.workout.number, heat: fh.heat.number, lane: fh.lane } : null,
      athletes: [...t.athletes].sort((a, b) => a.position - b.position)
        .map((a) => ({ id: a.id, name: `${a.first_name} ${a.last_name}`.trim(), captain: a.is_captain, checkedInAt: a.checked_in_at })),
    }
  })

  return <CheckIn teams={list} competition={settings?.competition_name ?? 'Warrior Leaders'} />
}
