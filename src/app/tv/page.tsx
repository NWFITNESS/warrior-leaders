import { AutoRefresh } from '@/components/AutoRefresh'
import { computeBoards, getBoardData } from '@/lib/public-data'
import { lowerTotalWins } from '@/lib/points'
import { TvRotator } from './tv-rotator'

export const revalidate = 15
export const metadata = { title: 'TV' }

export default async function TvPage() {
  const board = await getBoardData()
  const boards = board ? computeBoards(board) : []
  return (
    <>
      <AutoRefresh seconds={20} />
      <TvRotator boards={boards} lowerWins={board ? lowerTotalWins(board.settings.points_method) : true} />
    </>
  )
}
