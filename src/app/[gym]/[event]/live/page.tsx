import QRCode from 'qrcode'
import { parseAt } from '@/lib/live'
import { LiveScreen } from './live-screen'
import { headers } from 'next/headers'
import { eventFromParams, type EventParams } from '@/lib/public-event'

export const metadata = { title: 'Live' }
export const dynamic = 'force-dynamic' // reads the host for the QR code

// Big screen: dog race of the heat on the floor (left) + heat times (right).
//   /live              split screen
//   /live?view=race    race only
//   /live?view=heats   heat times only
//   &heat=<id>         show a particular heat instead of following the judges
//   &at=09:25          rehearsal: heat times run from that time instead of now
export default async function LivePage({ params, searchParams }: { params: EventParams; searchParams: Promise<{ view?: string; heat?: string; at?: string }> }) {
  const { event, base } = await eventFromParams(params)
  const { view, heat, at } = await searchParams
  const host = (await headers()).get('host') ?? 'leaders.northernwarrior.co.uk'
  const mode = view === 'race' || view === 'heats' ? view : 'split'
  // scan-for-scores code on the bottom bar (black on white so any phone reads it off a TV)
  const qr = await QRCode.toString(`https://${host}${base}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
  return <LiveScreen eventId={event.id} mode={mode} heatId={heat ?? null} at={parseAt(at)} qr={qr} />
}
