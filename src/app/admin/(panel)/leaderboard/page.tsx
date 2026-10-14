import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { buildEvents, divisionStandings, isReleased, type RankScore, type RankWorkout } from '@/lib/ranking'
import { lowerTotalWins } from '@/lib/points'
import type { Sex } from '@/lib/scoring'
import type { PointsMethod } from '@/lib/types'
import { BoardTable } from '@/components/LeaderboardTabs'

export const metadata = { title: 'Leaderboard' }
export const dynamic = 'force-dynamic'

export default async function AdminLeaderboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = 'preview' } = await searchParams
  const { supabase } = await requireStaff()
  const [{ data: settings }, { data: divisions }, { data: teams }, { data: workouts }, { data: scores }, { data: releases }] = await Promise.all([
    supabase.from('wl_competition_settings').select('points_method, custom_points').single(),
    supabase.from('wl_divisions').select('id, name, sex, level').order('sort_order'),
    supabase.from('wl_teams').select('id, name, division_id, athletes:wl_athletes(first_name, last_name, position)').order('name'),
    supabase.from('wl_workouts').select('id, number, name, combine_parts, parts:wl_workout_parts(*, part_movements:wl_part_movements(*))').order('number'),
    supabase.from('wl_scores').select('part_id, team_id, value, tiebreak_value, capped, entries').eq('status', 'verified'),
    supabase.from('wl_releases').select('part_id, division_id, released_at'),
  ])
  const method = (settings?.points_method ?? 'placing') as PointsMethod
  const events = buildEvents((workouts ?? []) as unknown as RankWorkout[])

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">Results</span>
          <h1>Leaderboard</h1>
          <p className="small muted" style={{ maxWidth: '70ch' }}>
            {view === 'public'
              ? 'Exactly what the public sees: released events only.'
              : 'Preview with every verified score, including events you haven’t released. Use it to check results before releasing.'}
          </p>
        </div>
        <div className="row">
          <Link href="/admin/leaderboard?view=preview" className={`btn btn-sm ${view === 'public' ? 'btn-ghost' : ''}`}>All verified</Link>
          <Link href="/admin/leaderboard?view=public" className={`btn btn-sm ${view === 'public' ? '' : 'btn-ghost'}`}>Public view</Link>
          <a href="/tv" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Open TV screen ↗</a>
        </div>
      </div>
      {events.length === 0 && <div className="empty">No scored workouts yet.</div>}
      {(divisions ?? []).map((d) => {
        const { events: shown, standings } = divisionStandings({
          division: { id: d.id, name: d.name, sex: d.sex as Sex, level: d.level }, teams: teams ?? [], events, scores: (scores ?? []) as RankScore[],
          releases: view === 'public' ? releases ?? [] : 'all', method, custom: settings?.custom_points ?? [],
        })
        const board = {
          division: { id: d.id, name: d.name },
          events: shown.map((e) => ({ key: e.key, label: e.label, title: e.title })),
          rows: standings.map((s) => ({
            teamId: s.team.id, team: s.team.name, rank: s.rank, total: s.total,
            athletes: ((teams ?? []).find((t) => t.id === s.team.id)?.athletes ?? []).sort((a, b) => a.position - b.position).map((a) => `${a.first_name} ${a.last_name}`.trim()).join(' & '),
            results: Object.fromEntries(Object.entries(s.results).map(([k, r]) => [k, { place: r.place, points: r.points, display: r.display, scored: r.scored }])),
          })),
        }
        return (
          <section key={d.id} className="stack-sm">
            <div className="spread" style={{ alignItems: 'center' }}>
              <h2>{d.name}</h2>
              <span className="row" style={{ gap: 6 }}>
                {events.map((e) => (
                  <span key={e.key} className={`pill ${isReleased(e, d.id, releases ?? []) ? 'pill-ok' : 'pill-dim'}`} title={e.title}>
                    E{e.label} {isReleased(e, d.id, releases ?? []) ? 'released' : 'not released'}
                  </span>
                ))}
              </span>
            </div>
            {board.events.length ? <BoardTable board={board} lowerWins={lowerTotalWins(method)} /> : <p className="subtle small">Nothing to show yet.</p>}
          </section>
        )
      })}
    </>
  )
}
