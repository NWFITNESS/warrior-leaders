import type { ScoreBreakdown } from '@/lib/scoring'

/** Each round under a total ("Round 3 · 3:07 · capped · 38 of 45 reps · 3:00 + 7 s"). */
export function ScoreLines({ breakdown }: { breakdown: ScoreBreakdown | null | undefined }) {
  if (!breakdown) return null
  return (
    <div className="score-lines">
      <span className="lbl">{breakdown.label}</span>
      {breakdown.lines.map((l) => (
        <span key={l.label} className={l.capped ? 'cap' : undefined}>
          <i>{l.label}</i><b>{l.value}</b>{l.note && <em>{l.note}</em>}
        </span>
      ))}
    </div>
  )
}
