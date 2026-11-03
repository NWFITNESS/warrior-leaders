'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import type { DivisionBoard } from '@/lib/public-data'

const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

export function LeaderboardTabs({ boards, lowerWins, linkTeams = true }: { boards: DivisionBoard[]; lowerWins: boolean; linkTeams?: boolean }) {
  const [div, setDiv] = useState(boards[0]?.division.id)
  const [pinned, setPinned] = useState<string | null>(null)

  useEffect(() => {
    try {
      const d = localStorage.getItem('wl-division'); if (d && boards.some((b) => b.division.id === d)) setDiv(d)
      setPinned(localStorage.getItem('wl-my-team'))
    } catch { /* storage blocked */ }
  }, [boards])
  const choose = (id: string) => { setDiv(id); try { localStorage.setItem('wl-division', id) } catch { /* ignore */ } }

  const board = boards.find((b) => b.division.id === div) ?? boards[0]
  if (!board) return null

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="div-tabs" role="tablist" aria-label="Division">
        {boards.map((b) => (
          <button key={b.division.id} type="button" role="tab" aria-pressed={b.division.id === board.division.id} onClick={() => choose(b.division.id)}>
            {b.division.name}
          </button>
        ))}
      </div>

      {board.events.length === 0 && (
        <p className="notice">No results released for {board.division.name} yet. Every team starts on 0 points; places appear as each workout is released.</p>
      )}
      <BoardTable board={board} pinned={pinned} lowerWins={lowerWins} linkTeams={linkTeams} />
      <p className="small subtle">
        {lowerWins ? 'Points = finishing place in each event (1st = 1). Lowest total wins.' : 'Highest total wins.'} Tap a team to see their scores and heats.
      </p>
    </div>
  )
}

export function BoardTable({ board, pinned, lowerWins, limit, linkTeams = true }: { board: DivisionBoard; pinned?: string | null; lowerWins: boolean; limit?: number; linkTeams?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const rows = limit ? board.rows.slice(0, limit) : board.rows
  return (
    <div className="table-wrap">
      <table className="lb-table">
        <thead>
          <tr>
            <th>#</th>
            <th className="l">Team</th>
            {board.events.map((e) => <th key={e.key} title={e.title}>E{e.label}</th>)}
            <th>{lowerWins ? 'Pts' : 'Pts'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = open === r.teamId
            return (
              <Fragment key={r.teamId}>
                {/* tap a team to see every event's result (the event columns are hidden on phones) */}
                <tr className={`lb-row${r.teamId === pinned ? ' pinned' : ''}${isOpen ? ' open' : ''}`} onClick={() => setOpen(isOpen ? null : r.teamId)} aria-expanded={isOpen}>
                  <td className="lb-rank">{board.events.length ? r.rank : '–'}</td>
                  <td className="lb-team">
                    <span className="lb-name">{r.team}</span>
                    <small>{r.athletes}</small>
                  </td>
                  {board.events.map((e) => {
                    const res = r.results[e.key]
                    return (
                      <td key={e.key} className="lb-ev">
                        <b>{res?.scored ? ordinal(res.place!) : '—'}</b>
                        <small>{res?.display ?? ''}</small>
                      </td>
                    )
                  })}
                  <td className="lb-pts">{r.total}<i className="lb-chev" aria-hidden>{isOpen ? '▴' : '▾'}</i></td>
                </tr>
                {isOpen && (
                  <tr className="lb-detail">
                    <td colSpan={board.events.length + 3}>
                      {board.events.length === 0 ? (
                        <p className="lb-none">No results released yet.</p>
                      ) : (
                        <ul>
                          {board.events.map((e) => {
                            const res = r.results[e.key]
                            return (
                              <li key={e.key}>
                                <span className="ev"><b>Event {e.label}</b><small>{e.title}</small></span>
                                <span className="pl">{res?.scored ? ordinal(res.place!) : '—'}</span>
                                <span className="sc">{res?.display ?? '—'}</span>
                                <span className="pt">{res?.points ?? 0} pts</span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      {linkTeams && <Link href={`/teams/${r.teamId}`} className="lb-more" onClick={(ev) => ev.stopPropagation()}>Team page, heats &amp; scores →</Link>}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
