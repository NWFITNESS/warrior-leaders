'use client'

import { useEffect, useState } from 'react'
import type { Lane } from '@/lib/judge-client'
import { PartScorer } from './part-scorer'
import { partTitleOr, scoringSummary } from '@/lib/types'

/** Team + workout header and the part tabs. The app bar (back, lane, sync) lives in page.tsx. */
export function TeamHeader({ lane }: { lane: Lane }) {
  const side = !!lane.workout.open_entry
  const scored = lane.parts.filter((p) => p.scored)
  return (
    <div className="j-team">
      {side && <span className={`j-level ${lane.team.level === 'scaled' ? 'sc' : 'rx'}`}>{lane.team.level === 'scaled' ? 'Scaled' : 'RX'}</span>}
      <h1>{lane.team.name}</h1>
      <p>{lane.team.division} · {lane.team.athletes.map((a) => a.first_name).join(' & ')}</p>
      <p className="ev">Event {lane.workout.number} · {lane.workout.name}{side ? ' · side event' : ''}</p>
      {side && scored.length > 0 && <p className="j-howto"><span>How it’s scored</span>{scored.map((p) => scoringSummary(p)).join(' · ')}</p>}
    </div>
  )
}

export function PartTabs({ lane, partId, onPick }: { lane: Lane; partId: string | undefined; onPick: (id: string) => void }) {
  if (lane.parts.length < 2) return null
  return (
    <div className="j-tabs" role="tablist">
      {lane.parts.map((p, i) => (
        <button key={p.id} type="button" role="tab" aria-pressed={p.id === partId} onClick={() => onPick(p.id)}>
          {partTitleOr(p, i)}
        </button>
      ))}
    </div>
  )
}

export function LaneView({ lane }: { lane: Lane }) {
  const [partId, setPartId] = useState(lane.parts[0]?.id)
  const part = lane.parts.find((p) => p.id === partId) ?? lane.parts[0]

  // Keep the phone awake while a lane is open.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const grab = () => nav.wakeLock?.request('screen').then((l) => { lock = l }, () => {})
    grab()
    const again = () => { if (document.visibilityState === 'visible') grab() }
    document.addEventListener('visibilitychange', again)
    return () => { document.removeEventListener('visibilitychange', again); lock?.release().catch(() => {}) }
  }, [])

  return (
    <div className="j-screen">
      <TeamHeader lane={lane} />
      <PartTabs lane={lane} partId={part?.id} onPick={setPartId} />
      {part ? <PartScorer key={part.id} lane={lane} part={part} /> : <div className="j-banner">This workout has no parts set up yet.</div>}
    </div>
  )
}
