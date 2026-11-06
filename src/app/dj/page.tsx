import type { Metadata, Viewport } from 'next'
import { parseAt } from '@/lib/live'
import { DjScreen } from './dj-screen'

export const metadata: Metadata = { title: 'DJ', robots: { index: false }, manifest: '/dj.webmanifest', appleWebApp: { capable: true, title: 'WL DJ', statusBarStyle: 'black-translucent' } }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0a0a0a' }

// The DJ's iPad: where we are in the day. Runs on the heat times (Admin → Heats), like the TV.
//   /dj            live
//   /dj?at=09:25   rehearsal from that time
export default async function DjPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  const { at } = await searchParams
  return <DjScreen at={parseAt(at)} />
}
