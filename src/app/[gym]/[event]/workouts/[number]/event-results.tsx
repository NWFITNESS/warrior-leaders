'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { EventDivisionResults } from '@/lib/public-data'

const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

/** This event's results, one category at a time (RX / Scaled, men / women). */
export function EventResults({ results, linkTeams = true, base = '' }: { results: EventDivisionResults[]; linkTeams?: boolean; base?: string }) {
  const [div, setDiv] = useState(results[0]?.division.id)
  useEffect(() => {
    try { const d = localStorage.getItem('wl-division'); if (d && results.some((r) => r.division.id === d)) setDiv(d) } catch { /* storage blocked */ }
  }, [results])
  const choose = (id: string) => { setDiv(id); try { localStorage.setItem('wl-division', id) } catch { /* ignore */ } }
  const r = results.find((x) => x.division.id === div) ?? results[0]
  if (!r) return null

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="div-tabs" role="tablist" aria-label="Division">
        {results.map((x) => (
          <button key={x.division.id} type="button" role="tab" aria-pressed={x.division.id === r.division.id} onClick={() => choose(x.division.id)}>{x.division.name}</button>
        ))}
      </div>
      {r.events.map((e) => (
        <div key={e.key} className="stack-sm">
          {r.events.length > 1 && <h3>Event {e.label}</h3>}
          {!e.released ? (
            <div className="empty">{r.division.name} results for Event {e.label} appear here once they’re checked and released.</div>
          ) : (
            <div className="table-wrap">
              <table className="lb-table">
                <thead><tr><th>#</th><th className="l">Team</th><th>Score</th><th>Pts</th></tr></thead>
                <tbody>
                  {e.rows.map((row) => (
                    <tr key={row.teamId}>
                      <td className="lb-rank">{row.scored && row.place ? ordinal(row.place) : '—'}</td>
                      <td className="lb-team">{linkTeams ? <Link href={`${base}/teams/${row.teamId}`}>{row.team}</Link> : <a>{row.team}</a>}<small>{row.athletes}</small></td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{row.display}{row.breakdown?.capNote && <small className="cap-note">{row.breakdown.capNote}</small>}</td>
                      <td className="lb-pts">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
