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
  return <LiveScreen mode={mode} heatId={heat ?? null} at={at && /^\d{1,2}:\d{2}$/.test(at) ? at : null} />
}
