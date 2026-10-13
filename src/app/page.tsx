import { AutoRefresh } from '@/components/AutoRefresh'
import { LeaderboardTabs } from '@/components/LeaderboardTabs'
import { PublicNav } from '@/components/PublicNav'
import { computeBoards, getBoardData } from '@/lib/public-data'
import { lowerTotalWins } from '@/lib/points'

export const revalidate = 15

export default async function Home() {
  const board = await getBoardData()
  const date = board ? new Date(board.settings.event_date + 'T09:00:00') : null
  const boards = board ? computeBoards(board) : []

  return (
    <main className="public" style={{ maxWidth: 980 }}>
      <AutoRefresh seconds={30} />
      <PublicNav current="/" />
      <header className="stack-sm" style={{ textAlign: 'center', justifyItems: 'center' }}>
        <h1 className="wordmark" style={{ fontSize: 'clamp(2rem, 7vw, 3rem)' }}>The Warrior <b>Leaders</b></h1>
        {date && (
          <p className="muted">
            {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {board?.settings.venue ? ` · ${board.settings.venue}` : ''}
          </p>
        )}
      </header>
      {boards.length ? (
        <LeaderboardTabs boards={boards} lowerWins={lowerTotalWins(board!.settings.points_method)} />
      ) : (
        <div className="empty">The leaderboard is getting ready. Check back soon.</div>
      )}
    </main>
  )
}
