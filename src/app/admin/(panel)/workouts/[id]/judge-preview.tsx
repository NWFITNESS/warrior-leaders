'use client'

import { useState } from 'react'
import { PartScorer } from '@/app/judge/part-scorer'
import type { JudgePart, Lane } from '@/lib/judge-client'
import { partTitleOr, type WorkoutPart } from '@/lib/types'

// What a judge sees on their phone for this workout, built from the builder's unsaved state.
// It's the real judge scoring screen in preview mode: try it out — nothing is stored or sent.

const DIVISIONS = [
  { key: 'rx-m', label: 'RX Male', level: 'rx', sex: 'male' },
  { key: 'rx-f', label: 'RX Female', level: 'rx', sex: 'female' },
  { key: 'sc-m', label: 'Scaled Male', level: 'scaled', sex: 'male' },
  { key: 'sc-f', label: 'Scaled Female', level: 'scaled', sex: 'female' },
] as const

type PreviewPart = WorkoutPart & { id: string }

export function JudgePreview({ number, name, description, parts }: { number: string; name: string; description: string; parts: PreviewPart[] }) {
  const [div, setDiv] = useState<(typeof DIVISIONS)[number]['key']>('rx-m')
  const [partId, setPartId] = useState<string | null>(null)
  const [run, setRun] = useState(0) // "Start again" remounts the scorer
  const d = DIVISIONS.find((x) => x.key === div)!
  const part = parts.find((p) => p.id === partId) ?? parts[0]

  const lane: Lane = {
    lane_assignment_id: 'preview', heat_id: 'preview', heat_number: 1, start_time: '09:00', lane: 1, judge_name: 'Preview',
    workout: { id: 'preview', number: Number(number) || 0, name: name || 'Untitled', description: description || null, status: 'ready' },
    team: {
      id: 'preview', name: 'Sample Team', division: d.label, level: d.level, sex: d.sex,
      athletes: [
        { id: 'a1', first_name: 'Alex', last_name: 'Example', is_captain: true },
        { id: 'a2', first_name: 'Sam', last_name: 'Example', is_captain: false },
      ],
    },
    parts: parts as JudgePart[],
    scores: [],
  }

  // Anything that changes the shape of the score (type, rounds, movements, division) starts the preview afresh;
  // names, reps, loads and standards update live without losing the run.
  const shape = part ? [part.id, part.score_type, part.rounds, part.load_entry, part.part_movements.map((m) => m.id).join(','), div, run].join('|') : ''

  return (
    <aside className="jp">
      <div className="spread" style={{ alignItems: 'baseline' }}>
        <span className="eyebrow">Judge’s phone</span>
        <button type="button" className="linkbtn small" onClick={() => setRun((n) => n + 1)}>Start again</button>
      </div>
      <div className="seg jp-divs" aria-label="Preview as division">
        {DIVISIONS.map((x) => <button key={x.key} type="button" aria-pressed={x.key === div} onClick={() => setDiv(x.key)}>{x.label}</button>)}
      </div>

      <div className="jp-phone">
        <div className="jp-screen">
          <main className="judge" style={{ minHeight: 0 }}>
            <header className="j-top">
              <span className="who">Preview judge</span>
              <span className="j-sync ok">● Preview</span>
            </header>
            <div className="stack" style={{ gap: 12 }}>
              <span className="linkbtn" style={{ fontSize: '1rem' }}>← All lanes</span>
              <div className="stack-sm" style={{ gap: 4 }}>
                <div className="spread" style={{ alignItems: 'baseline' }}>
                  <h1 style={{ fontSize: '1.6rem', textTransform: 'none' }}>{lane.team.name}</h1>
                  <span className="eyebrow">Lane 1 · Heat 1</span>
                </div>
                <span className="muted small">{d.label} · Alex Example &amp; Sam Example</span>
                <span className="small subtle">Event {number || '?'} · {name || 'Untitled'}</span>
              </div>
              {parts.length > 1 && (
                <div className="j-tabs" role="tablist">
                  {parts.map((p, i) => (
                    <button key={p.id} type="button" role="tab" aria-pressed={p.id === part?.id} onClick={() => setPartId(p.id)}>{partTitleOr(p, i)}</button>
                  ))}
                </div>
              )}
              {part && part.part_movements.length > 0
                ? <PartScorer key={shape} lane={lane} part={part as JudgePart} preview />
                : <p className="notice">Add a movement to see the judge’s screen.</p>}
            </div>
          </main>
        </div>
      </div>
      <p className="small subtle">Live from the form above (unsaved changes included). Tap through it like a judge — nothing is saved or sent.</p>
    </aside>
  )
}
