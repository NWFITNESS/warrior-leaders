import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import type { Division, Team } from '@/lib/types'

export const metadata = { title: 'Teams' }

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const { supabase } = await requireStaff()
  const [{ data: divisions }, { data: teams }] = await Promise.all([
    supabase.from('wl_divisions').select('*').order('sort_order').returns<Division[]>(),
    supabase.from('wl_teams').select('*, athletes:wl_athletes(*)').order('name').returns<Team[]>(),
  ])

  const needle = q.trim().toLowerCase()
  const filtered = (teams ?? []).filter((t) =>
    !needle ||
    t.name.toLowerCase().includes(needle) ||
    t.athletes?.some((a) => `${a.first_name} ${a.last_name} ${a.email ?? ''}`.toLowerCase().includes(needle))
  )

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">{teams?.length ?? 0} teams</span>
          <h1>Teams &amp; athletes</h1>
        </div>
        <div className="row">
          <Link className="btn btn-ghost" href="/admin/teams/import">Import CSV</Link>
          <Link className="btn" href="/admin/teams/new">Add team</Link>
        </div>
      </div>

      <form className="row">
        <input name="q" defaultValue={q} placeholder="Search teams, athletes or emails" className="input" style={{ maxWidth: 360 }} />
        <button className="btn btn-ghost btn-sm">Search</button>
        {q && <Link href="/admin/teams" className="small">Clear</Link>}
      </form>

      {(teams?.length ?? 0) === 0 ? (
        <div className="empty">
          No teams yet. <Link href="/admin/teams/import">Import a CSV</Link> or <Link href="/admin/teams/new">add one by hand</Link>.
        </div>
      ) : (
        (divisions ?? []).map((d) => {
          const list = filtered.filter((t) => t.division_id === d.id)
          if (needle && list.length === 0) return null
          return (
            <section key={d.id} className="stack-sm">
              <h2>{d.name} <span className="subtle small mono">· {list.length}</span></h2>
              <div className="card table-wrap" style={{ padding: 0 }}>
                <table className="table">
                  <thead>
                    <tr><th style={{ width: 50 }}>Bib</th><th>Team</th><th>Athletes</th><th>Emails</th><th></th></tr>
                  </thead>
                  <tbody>
                    {list.length === 0 && (
                      <tr><td colSpan={5} className="subtle">No teams in this division yet.</td></tr>
                    )}
                    {list.map((t) => {
                      const ath = [...(t.athletes ?? [])].sort((a, b) => a.position - b.position)
                      return (
                        <tr key={t.id}>
                          <td className="mono subtle">{t.bib ?? '—'}</td>
                          <td style={{ fontWeight: 600 }}>{t.name}</td>
                          <td>
                            {ath.map((a) => (
                              <div key={a.id}>
                                {a.first_name} {a.last_name}
                                {a.is_captain && <span className="pill pill-gold" style={{ marginLeft: 6 }}>Captain</span>}
                              </div>
                            ))}
                          </td>
                          <td className="small muted">{ath.map((a) => <div key={a.id}>{a.email ?? <span className="subtle">no email</span>}</div>)}</td>
                          <td style={{ textAlign: 'right' }}><Link href={`/admin/teams/${t.id}`} className="small">Edit</Link></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })
      )}
    </>
  )
}
