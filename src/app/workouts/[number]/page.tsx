import { redirect } from 'next/navigation'
import { currentEventBase } from '@/lib/public-event'

export const dynamic = 'force-dynamic'

// Old address: this workout in the current event
export default async function Old({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params
  redirect(`${await currentEventBase()}/workouts/${encodeURIComponent(number)}`)
}
