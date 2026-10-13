import Link from 'next/link'
import { getPublicTeams } from '@/lib/public-data'
import { Logo } from '@/components/Logo'

export const revalidate = 60
export const metadata = { title: 'Teams' }

export default async function TeamsPublic() {
  const { divisions, teams } = await getPublicTeams()

  return (
    <main className="public">
      <header className="stack-sm">
        <Link href="/" aria-label="The Warrior Leaders home"><Logo width={180} /></Link>
        <Link href="/" className="small">← The Warrior Leaders</Link>
        <h1>Teams</h1>
        <p className="muted">{teams.length} pairs across {divisions.length} divisions.</p>
      </header>

      {divisions.map((d) => {
        const list = teams.filter((t) => t.division_id === d.id)
        return (
          <section key={d.id} className="stack-sm">
            <h2 style={{ color: 'var(--gold-hi)' }}>{d.name} <span className="subtle small mono">· {list.length}</span></h2>
            {list.length === 0 ? (
              <p className="subtle small">Teams to be announced.</p>
            ) : (
              <div className="card" style={{ padding: '4px 16px' }}>
                {list.map((t, i) => (
                  <div key={t.id} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="small subtle">
                      {[...t.athletes].sort((a, b) => a.position - b.position).map((a) => `${a.first_name} ${a.last_name}`.trim()).join(' & ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </main>
  )
}
