import { AutoRefresh } from '@/components/AutoRefresh'
import { LeaderboardTabs } from '@/components/LeaderboardTabs'
import { PublicNav } from '@/components/PublicNav'
import { computeBoards, getBoardData } from '@/lib/public-data'
import { lowerTotalWins } from '@/lib/points'
import { eventDates } from '@/lib/dates'
import { eventFromParams, type EventParams } from '@/lib/public-event'

export const revalidate = 15

export async function generateMetadata({ params }: { params: EventParams }) {
  const { event } = await eventFromParams(params)
  return { title: { absolute: `${event.short_name} · Leaderboard` } }
}

export default async function Home({ params }: { params: EventParams }) {
  const { event, base } = await eventFromParams(params)
  const board = await getBoardData(event.id)
  const boards = board ? computeBoards(board) : []

  return (
    <main className="public" style={{ maxWidth: 980 }}>
      <AutoRefresh seconds={30} />
      <PublicNav base={base} current="" />
      <header className="stack-sm" style={{ textAlign: 'center', justifyItems: 'center' }}>
        <h1 className="wordmark" style={{ fontSize: 'clamp(2rem, 7vw, 3rem)' }}>Warrior <b>Leaders</b></h1>
        <p className="muted">
          {event.name}
          <br />
          {eventDates(event.start_date, event.end_date, true)}{event.venue ? ` · ${event.venue}` : ''}
        </p>
      </header>
      {boards.length ? (
        <LeaderboardTabs boards={boards} lowerWins={lowerTotalWins(board!.settings.points_method)} base={base} />
      ) : (
        <div className="empty">The leaderboard is getting ready. Check back soon.</div>
      )}
    </main>
  )
}
