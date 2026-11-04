import { requireStaff } from '@/lib/auth'
import { HeatSheetView } from './sheet-view'

export const metadata = { title: 'Heat times' }
export const dynamic = 'force-dynamic'

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

type Part = { time_cap_seconds: number | null; score_type: string; rounds: number }
type Div = { id: string; level: string; sex: string; sort_order: number }

/** One-page summary of every event's heat times (no lanes / teams), for printing or the screen. */
export default async function HeatSheet() {
  const { supabase } = await requireStaff()
  const [{ data: settings }, { data: workouts }, { data: heats }, { data: divisions }] = await Promise.all([
    supabase.from('wl_competition_settings').select('name, event_date, venue').single(),
    supabase.from('wl_workouts').select('id, number, name, status, open_entry, public_from, heat_minutes, parts:wl_workout_parts(time_cap_seconds, score_type, rounds)').order('number'),
    supabase.from('wl_heats').select('id, workout_id, number, start_time, lanes:wl_lane_assignments(team:wl_teams(division_id))').order('number'),
    supabase.from('wl_divisions').select('id, level, sex, sort_order').order('sort_order'),
  ])
  const divById = new Map((divisions ?? []).map((d: Div) => [d.id, d]))
  const date = settings?.event_date
    ? new Date(`${settings.event_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const events = (workouts ?? []).map((w) => {
    const len = w.heat_minutes ?? Math.ceil((w.parts as Part[]).reduce((n, p) => n + (p.time_cap_seconds ?? 0) * (p.score_type === 'for_time' ? Math.max(1, p.rounds) : 1), 0) / 60)
    const hs = (heats ?? []).filter((h) => h.workout_id === w.id && !w.open_entry).map((h) => {
      const divs = [...new Set((h.lanes as unknown as { team: { division_id: string } | null }[]).map((l) => l.team?.division_id).filter(Boolean) as string[])]
        .map((id) => divById.get(id)).filter(Boolean) as Div[]
      return { id: h.id, number: h.number, start: h.start_time?.slice(0, 5) ?? null, teams: (h.lanes as unknown[]).length, divs: divs.sort((a, b) => a.sort_order - b.sort_order) }
    })
    const timed = hs.filter((h) => h.start)
    const first = timed[0]?.start
    const last = timed[timed.length - 1]?.start
    const opens = w.public_from ? new Date(w.public_from).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : null
    return { ...w, len, heats: hs, window: first && last ? `${first}–${fromMin(toMin(last) + len)}` : null, opens }
  })

  return <HeatSheetView date={date} venue={settings?.venue ?? ''} events={events} />
}
