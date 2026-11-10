import { AutoRefresh } from '@/components/AutoRefresh'
import { computeBoards, getBoardData } from '@/lib/public-data'
import { lowerTotalWins } from '@/lib/points'
import { TvRotator } from './tv-rotator'
import { headers } from 'next/headers'
import { eventFromParams, type EventParams } from '@/lib/public-event'

export const revalidate = 15
export const metadata = { title: 'TV' }

export default async function TvPage({ params }: { params: EventParams }) {
  const { event, base } = await eventFromParams(params)
  const host = (await headers()).get('host') ?? 'leaders.northernwarrior.co.uk'
  const board = await getBoardData(event.id)
  const boards = board ? computeBoards(board) : []
  return (
    <>
      <AutoRefresh seconds={20} />
      <TvRotator boards={boards} lowerWins={board ? lowerTotalWins(board.settings.points_method) : true} site={`${host}${base}`} />
    </>
  )
}
