import { redirect } from 'next/navigation'
import { currentEventBase } from '@/lib/public-event'

export const dynamic = 'force-dynamic'

// The old single-event address: go to the current event's leaderboard (QR codes, posters, bookmarks).
export default async function Root() {
  redirect(await currentEventBase())
}
