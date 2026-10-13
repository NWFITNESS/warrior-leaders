import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import type { Division, Settings } from '@/lib/types'

export const metadata = { title: 'Overview' }

export default async function Overview() {
  const { supabase } = await requireStaff()
  const [{ data: settings }, { data: divisions }, { data: teams }, { count: athleteCount }, { data: workouts }, { count: judgeCount }] =
    await Promise.all([
      supabase.from('wl_competition_settings').select('*').single<Settings>(),
      supabase.from('wl_divisions').select('*').order('sort_order').returns<Division[]>(),
      supabase.from('wl_teams').select('id, division_id'),
      supabase.from('wl_athletes').select('id', { count: 'exact', head: true }),
      supabase.from('wl_workouts').select('id, workout_parts:wl_workout_parts(id, scored)'),
      supabase.from('wl_judges').select('id', { count: 'exact', head: true }).eq('active', true),
    ])

  const teamCount = teams?.length ?? 0
  const scoredParts = (workouts ?? []).reduce(
    (n, w: { workout_parts: { scored: boolean }[] }) => n + w.workout_parts.filter((p) => p.scored).length,
    0
  )
  const eventDate = settings ? new Date(settings.event_date + 'T09:00:00') : null
  const days = eventDate ? Math.ceil((eventDate.getTime() - Date.now()) / 86_400_000) : null

  const checklist = [
    { done: teamCount > 0, label: 'Load teams and athletes', href: '/admin/teams' },
    { done: (workouts?.length ?? 0) > 0, label: 'Build the workouts', href: '/admin/workouts' },
    { done: (judgeCount ?? 0) > 0, label: 'Add judges', href: '/admin/judges' },
    { done: !!settings, label: 'Check points method, lanes and judge code', href: '/admin/settings' },
  ]

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">{settings?.venue ?? 'Northern Warrior'}</span>
          <h1>{settings?.name ?? 'The Warrior Leaders'}</h1>
          <p className="muted">
            {eventDate?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {days != null && days >= 0 && <> · <b style={{ color: 'var(--gold-hi)' }}>{days} days to go</b></>}
          </p>
        </div>
      </div>

      <div className="grid-4">
        <div className="stat"><b>{teamCount}</b><span>Teams</span></div>
        <div className="stat"><b>{athleteCount ?? 0}</b><span>Athletes</span></div>
        <div className="stat"><b>{workouts?.length ?? 0}</b><span>Workouts · {scoredParts} scored parts</span></div>
        <div className="stat"><b>{judgeCount ?? 0}</b><span>Active judges</span></div>
      </div>

      <div className="grid-2">
        <section className="card stack">
          <h2>Teams by division</h2>
          <table className="table">
            <tbody>
              {(divisions ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{teams?.filter((t) => t.division_id === d.id).length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card stack">
          <h2>Setup checklist</h2>
          <div className="stack-sm">
            {checklist.map((c) => (
              <Link key={c.label} href={c.href} className="row" style={{ color: c.done ? 'var(--muted)' : 'var(--text)' }}>
                <span className={`pill ${c.done ? 'pill-ok' : 'pill-dim'}`}>{c.done ? 'Done' : 'To do'}</span>
                {c.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
