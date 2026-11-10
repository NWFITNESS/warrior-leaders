'use client'

import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { BoardTable } from '@/components/LeaderboardTabs'
import type { DivisionBoard } from '@/lib/public-data'

/** Big-screen leaderboard: shows each division with released results in turn. */
export function TvRotator({ boards, lowerWins, site }: { boards: DivisionBoard[]; lowerWins: boolean; site: string }) {
  const live = boards.filter((b) => b.events.length > 0)
  const list = live.length ? live : boards
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => n + 1), 15_000)
    return () => window.clearInterval(id)
  }, [])
  const board = list[i % Math.max(1, list.length)]

  return (
    <main className="tv">
      <header className="spread" style={{ alignItems: 'center' }}>
        <Logo width={360} />
        <div style={{ textAlign: 'right' }}>
          <div className="eyebrow" style={{ fontSize: '0.9vw' }}>Leaderboard</div>
          {board && <div className="wordmark" style={{ fontSize: '2.6vw' }}>{board.division.name}</div>}
        </div>
      </header>
      {!board ? null : board.events.length === 0 ? (
        <div className="empty" style={{ fontSize: '2vw', alignSelf: 'center' }}>Results appear here as each workout is released.</div>
      ) : (
        <BoardTable board={board} lowerWins={lowerWins} limit={12} />
      )}
      <footer className="spread small subtle" style={{ fontSize: '1vw' }}>
        <span>{site}</span>
        <span>{list.map((b, k) => <span key={b.division.id} style={{ marginLeft: 16, color: k === i % list.length ? 'var(--gold-hi)' : undefined }}>{b.division.name}</span>)}</span>
      </footer>
    </main>
  )
}
