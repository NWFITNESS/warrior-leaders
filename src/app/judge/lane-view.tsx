'use client'

import { useEffect, useState } from 'react'
import type { Lane } from '@/lib/judge-client'
import { PartScorer } from './part-scorer'

export function LaneView({ lane, onBack }: { lane: Lane; onBack: () => void }) {
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
    <div className="stack" style={{ gap: 12 }}>
      <button className="linkbtn" style={{ justifySelf: 'start', fontSize: '1rem' }} onClick={onBack}>← All lanes</button>
      <div className="stack-sm" style={{ gap: 4 }}>
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <h1 style={{ fontSize: '1.6rem', textTransform: 'none' }}>{lane.team.name}</h1>
          <span className="eyebrow">Lane {lane.lane} · Heat {lane.heat_number}</span>
        </div>
        <span className="muted small">
          {lane.team.division} · {lane.team.athletes.map((a) => `${a.first_name} ${a.last_name}`.trim()).join(' & ')}
        </span>
        <span className="small subtle">Event {lane.workout.number} · {lane.workout.name}</span>
      </div>

      {lane.parts.length > 1 && (
        <div className="j-tabs" role="tablist">
          {lane.parts.map((p) => (
            <button key={p.id} type="button" role="tab" aria-pressed={p.id === part?.id} onClick={() => setPartId(p.id)}>
              Part {p.label}{p.name ? ` · ${p.name}` : ''}
            </button>
          ))}
        </div>
      )}

      {part ? <PartScorer key={part.id} lane={lane} part={part} /> : <p className="notice">This workout has no parts set up yet.</p>}
    </div>
  )
}
