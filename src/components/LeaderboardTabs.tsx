'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { DivisionBoard } from '@/lib/public-data'

const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

export function LeaderboardTabs({ boards, lowerWins }: { boards: DivisionBoard[]; lowerWins: boolean }) {
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

      {board.events.length === 0 ? (
        <div className="empty">No results released for {board.division.name} yet. They’ll appear here as soon as the judges release each workout.</div>
      ) : (
        <BoardTable board={board} pinned={pinned} lowerWins={lowerWins} />
      )}
      <p className="small subtle">
        {lowerWins ? 'Points = finishing place in each event (1st = 1). Lowest total wins.' : 'Highest total wins.'} Tap a team to see their scores and heats.
      </p>
    </div>
  )
}

export function BoardTable({ board, pinned, lowerWins, limit }: { board: DivisionBoard; pinned?: string | null; lowerWins: boolean; limit?: number }) {
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
          {rows.map((r) => (
            <tr key={r.teamId} className={r.teamId === pinned ? 'pinned' : undefined}>
              <td className="lb-rank">{r.rank}</td>
              <td className="lb-team">
                <Link href={`/teams/${r.teamId}`}>{r.team}</Link>
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
              <td className="lb-pts">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
