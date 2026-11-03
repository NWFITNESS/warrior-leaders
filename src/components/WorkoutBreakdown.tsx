import { Standards } from '@/components/Standards'
import { describeMovement, formatCap, hasScaledVersion, partTitle, resolveMovement, scoringSummary, type WorkoutPart } from '@/lib/types'

// The full breakdown of a workout for athletes: how each part is scored, RX and Scaled side by side with standards.
export function WorkoutBreakdown({ parts }: { parts: (WorkoutPart & { id: string })[] }) {
  const sorted = [...parts].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <>
      {sorted.map((p) => (
        <div key={p.id} className="stack-sm">
          {sorted.length > 1 && (partTitle(p) || !p.scored) && <h3>{partTitle(p)}{!p.scored && <span className="small subtle"> (not scored)</span>}</h3>}
          <p className="muted small">
            {p.score_type === 'for_time' && p.rounds > 1
              ? `${p.rounds} rounds, each in a ${formatCap(p.time_cap_seconds)} window. Each round is timed; your score is the total. Lowest wins.`
              : `${scoringSummary(p)}.`}
            {p.tiebreak_note ? ` Tiebreak: ${p.tiebreak_note}.` : ''}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th style={{ width: '50%' }}>RX</th><th>Scaled</th></tr></thead>
              <tbody>
                {p.part_movements.map((m) => {
                  const sc = resolveMovement(m, 'scaled')
                  return (
                    <tr key={m.id}>
                      <td><b>{describeMovement(m)}</b><Standards text={m.standards} className="small muted std-public" /></td>
                      <td>
                        <b style={hasScaledVersion(m) ? undefined : { color: 'var(--muted)', fontWeight: 500 }}>{describeMovement(sc)}</b>
                        {sc.standards !== m.standards && <Standards text={sc.standards} className="small muted std-public" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  )
}
