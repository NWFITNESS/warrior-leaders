import type { Metadata, Viewport } from 'next'
import { parseAt } from '@/lib/live'
import { DjScreen } from './dj-screen'
import { eventFromParams, type EventParams } from '@/lib/public-event'

export const metadata: Metadata = { title: 'DJ', robots: { index: false }, manifest: '/dj.webmanifest', appleWebApp: { capable: true, title: 'WL DJ', statusBarStyle: 'black-translucent' } }
export const dynamic = 'force-dynamic' // reads ?at= from the address
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0a0a0a' }

// The DJ's iPad: where we are in the day. Runs on the heat times (Admin → Heats), like the TV.
//   /dj            live
//   /dj?at=09:25   rehearsal from that time
export default async function DjPage({ params, searchParams }: { params: EventParams; searchParams: Promise<{ at?: string }> }) {
  const { event } = await eventFromParams(params)
  const { at } = await searchParams
  return <DjScreen eventId={event.id} at={parseAt(at)} />
}
