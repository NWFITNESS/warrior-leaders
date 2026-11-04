'use client'

import { Standards, standardsLines } from '@/components/Standards'
import type { JudgeHeat, JudgeWorkout } from '@/lib/judge-client'
import { describeMovement, formatCap, hasScaledVersion, partTitle, resolveMovement, scoringSummary } from '@/lib/types'

/** Head judge: every workout — heat times, how it's scored, movements RX + Scaled, and the standards. */
export function WorkoutSheet({ workouts, heats }: { workouts: JudgeWorkout[]; heats: JudgeHeat[] }) {
  if (workouts.length === 0) return <div className="j-empty"><p className="j-note">No workouts are ready yet.</p></div>
  return (
    <div className="j-screen">
      {workouts.map((w, i) => {
        const hs = heats.filter((h) => h.workout_id === w.id).sort((a, b) => a.number - b.number)
        const times = hs.map((h) => h.start_time?.slice(0, 5)).filter(Boolean)
        const parts = [...w.parts].sort((a, b) => a.sort_order - b.sort_order)
        return (
          <details key={w.id} className="j-wod" open={i === 0}>
            <summary>
              <span className="n">{w.number}</span>
              <span className="main">
                <b>{w.name}</b>
                <small>
                  {w.open_entry ? 'Side event · no heats' : hs.length ? `${hs.length} heat${hs.length > 1 ? 's' : ''}${times.length ? ` · ${times[0]}–${times[times.length - 1]}` : ''}` : 'No heats yet'}
                  {w.status === 'draft' ? ' · Draft' : ''}
                </small>
              </span>
            </summary>
            <div className="j-wod-body">
              {standardsLines(w.description).length > 0 && <Standards text={w.description} className="j-wod-desc" />}

              {hs.length > 0 && (
                <div className="j-heat-times">
                  {hs.map((h) => <span key={h.id}><i>Heat {h.number}</i>{h.start_time?.slice(0, 5) ?? '—'}</span>)}
                </div>
              )}

              {parts.map((p) => (
                <div key={p.id} className="j-wod-part">
                  {parts.length > 1 && <h3>{partTitle(p) ?? 'Part'}{!p.scored && <small> · not scored</small>}</h3>}
                  <p className="j-wod-score">
                    {p.score_type === 'for_time' && p.rounds > 1
                      ? `${p.rounds} rounds, each in a ${formatCap(p.time_cap_seconds)} window. Total of the round times, lowest wins.`
                      : `${scoringSummary(p)}.`}
                    {p.tiebreak_note && <><br /><span>Tiebreak: {p.tiebreak_note}</span></>}
                  </p>
                  <ol className="j-moves">
                    {p.part_movements.map((m) => {
                      const sc = resolveMovement(m, 'scaled')
                      return (
                        <li key={m.id}>
                          <b>{describeMovement(m)}</b>
                          {hasScaledVersion(m) && <span className="sc">Scaled: {describeMovement(sc)}</span>}
                          <Standards text={m.standards} className="j-std" />
                          {sc.standards !== m.standards && standardsLines(sc.standards).length > 0 && (
                            <><span className="sc">Scaled standards</span><Standards text={sc.standards} className="j-std" /></>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                  {p.notes && <Standards text={p.notes} className="j-wod-desc" />}
                </div>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
