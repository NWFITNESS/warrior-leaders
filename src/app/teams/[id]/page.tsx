import { redirect } from 'next/navigation'
import { currentEventBase } from '@/lib/public-event'
import { getTeamEventPath } from '@/lib/public-data'

export const dynamic = 'force-dynamic'

// Old team links (emails from before events had their own address): the team's own event
export default async function Old({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const base = (await getTeamEventPath(id)) ?? (await currentEventBase())
  redirect(`${base}/teams/${encodeURIComponent(id)}`)
}
