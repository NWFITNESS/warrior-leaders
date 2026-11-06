import QRCode from 'qrcode'
import { parseAt } from '@/lib/live'
import { LiveScreen } from './live-screen'

export const metadata = { title: 'Live' }

// Big screen: dog race of the heat on the floor (left) + heat times (right).
//   /live              split screen
//   /live?view=race    race only
//   /live?view=heats   heat times only
//   &heat=<id>         show a particular heat instead of following the judges
//   &at=09:25          rehearsal: heat times run from that time instead of now
export default async function LivePage({ searchParams }: { searchParams: Promise<{ view?: string; heat?: string; at?: string }> }) {
  const { view, heat, at } = await searchParams
  const mode = view === 'race' || view === 'heats' ? view : 'split'
  // scan-for-scores code on the bottom bar (black on white so any phone reads it off a TV)
  const qr = await QRCode.toString('https://leaders.northernwarrior.co.uk', { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
  return <LiveScreen mode={mode} heatId={heat ?? null} at={parseAt(at)} qr={qr} />
}
