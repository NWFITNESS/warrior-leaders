'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminInputFrom, computeScore, type AdminInput, type Entries, type Sex } from '@/lib/scoring'
import { partTitleOr, resolvePart, type WorkoutPart } from '@/lib/types'
import { logAppeal, resolveAppeal, saveAdminScore, setRelease, setStatus } from './actions'

export interface BoardRow { teamId: string; teamName: string; divisionId: string; divisionName: string; sex: Sex; level: string; heat: number | null; lane: number | null; judge: string | null }
interface Appeal { id: string; description: string; status: 'open' | 'upheld' | 'rejected'; resolution: string | null; created_at: string }
interface Score {
  id: string; part_id: string; team_id: string; status: 'draft' | 'submitted' | 'verified' | 'appeal' | 'rejected'; source: 'judge' | 'paper' | 'admin'
  value: number | null; tiebreak_value: number | null; entries: Entries | Record<string, never>; signed_by: string | null
  submitted_at: string | null; verified_by: string | null; judge: { name: string } | null; appeals: Appeal[]
}
type Part = WorkoutPart & { id: string }

const STATUS: Record<Score['status'], [string, string]> = {
  draft: ['Being scored', 'pill-warn'], submitted: ['Check', 'pill-gold'], verified: ['Verified', 'pill-ok'], appeal: ['Appeal', 'pill-bad'], rejected: ['Rejected', 'pill-bad'],
}

export function ScoresBoard({ workoutNumber, parts, events, divisions, rows, scores, releases, otherTeams }: {
  workoutNumber: number; parts: Part[]; events: { key: string; label: string; title: string; partIds: string[] }[]
  divisions: { id: string; name: string }[]; rows: BoardRow[]; scores: Score[]
  releases: { part_id: string; division_id: string; released_at: string }[]; otherTeams: { id: string; name: string; divisionId: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [division, setDivision] = useState('all')
  const [onlyAction, setOnlyAction] = useState(false)
  const [open, setOpen] = useState<string | null>(null) // `${partId}:${teamId}:${panel}`
  const [extraTeam, setExtraTeam] = useState('')

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) => start(async () => {
    setError('')
    const res = await fn()
    if (res.error) setError(res.error)
    else { after?.(); router.refresh() }
  })

  const scoreOf = (partId: string, teamId: string) => scores.find((s) => s.part_id === partId && s.team_id === teamId)
  const visibleRows = rows.filter((r) => division === 'all' || r.divisionId === division)
  const extraRow = useMemo(() => {
    const t = otherTeams.find((o) => o.id === extraTeam)
    if (!t) return null
    const d = divisions.find((x) => x.id === t.divisionId)
    const sex = rows.find((r) => r.divisionId === t.divisionId)?.sex ?? (d?.name.toLowerCase().includes('female') ? 'female' : 'male')
    const level = rows.find((r) => r.divisionId === t.divisionId)?.level ?? (d?.name.toLowerCase().includes('scaled') ? 'scaled' : 'rx')
    return { teamId: t.id, teamName: t.name, divisionId: t.divisionId, divisionName: d?.name ?? '', sex, level, heat: null, lane: null, judge: null } as BoardRow
  }, [extraTeam, otherTeams, divisions, rows])

  return (
    <div className="stack" style={{ gap: 22 }}>
      {error && <p className="notice notice-bad" role="alert">{error}</p>}

      {/* ── Release ── */}
      <section className="card stack-sm">
        <h2>Release results</h2>
        <p className="small muted">A division’s results go public when you release them. Open appeals and unchecked scores block a release. Teams with no score are placed last.</p>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 640 }}>
            <thead><tr><th>Event</th>{divisions.map((d) => <th key={d.id}>{d.name}</th>)}</tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.key}>
                  <td style={{ fontWeight: 600 }}>E{e.label}<div className="small subtle" style={{ fontWeight: 400 }}>{e.title}</div></td>
                  {divisions.map((d) => {
                    const teams = rows.filter((r) => r.divisionId === d.id)
                    const ss = teams.map((t) => e.partIds.map((p) => scoreOf(p, t.teamId)))
                    const verified = ss.filter((x) => x.every((s) => s?.status === 'verified')).length
                    const appeals = ss.flat().filter((s) => s?.status === 'appeal').length
                    const waiting = ss.flat().filter((s) => s && (s.status === 'submitted' || s.status === 'draft')).length
                    const rel = e.partIds.every((p) => releases.some((r) => r.part_id === p && r.division_id === d.id))
                    const relAt = releases.find((r) => r.part_id === e.partIds[0] && r.division_id === d.id)?.released_at
                    return (
                      <td key={d.id} className="small">
                        <div className="stack-sm" style={{ gap: 4 }}>
                          <span className="mono">{verified}/{teams.length} verified</span>
                          {appeals > 0 && <span className="pill pill-bad">{appeals} appeal{appeals > 1 ? 's' : ''}</span>}
                          {waiting > 0 && <span className="pill pill-warn">{waiting} to check</span>}
                          {rel ? (
                            <>
                              <span className="pill pill-ok">Released {relAt ? new Date(relAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                              <button className="linkbtn danger" disabled={pending} onClick={() => run(() => setRelease(e.partIds, d.id, false))}>Unrelease</button>
                            </>
                          ) : (
                            <button className="btn btn-sm" disabled={pending || teams.length === 0} onClick={() => run(() => setRelease(e.partIds, d.id, true))}>Release</button>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Filters ── */}
      <div className="row">
        <select className="input" style={{ maxWidth: 220 }} value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Division">
          <option value="all">All divisions</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={onlyAction} onChange={(e) => setOnlyAction(e.target.checked)} />Only scores that need me</label>
      </div>

      {parts.map((p, pi) => {
        const partRows = [...visibleRows, ...(extraRow && !visibleRows.some((r) => r.teamId === extraRow.teamId) ? [extraRow] : [])]
          .filter((r) => !onlyAction || ['submitted', 'appeal', undefined].includes(scoreOf(p.id, r.teamId)?.status) )
        const toVerify = partRows.map((r) => scoreOf(p.id, r.teamId)).filter((s): s is Score => s?.status === 'submitted')
        return (
          <section key={p.id} className="stack-sm">
            <div className="spread" style={{ alignItems: 'center' }}>
              <h2>{parts.length > 1 ? `Event ${workoutNumber} · ${partTitleOr(p, pi)}` : `Event ${workoutNumber}`}{!p.scored && <span className="small subtle"> (buy-in, not ranked)</span>}</h2>
              <button className="btn btn-sm" disabled={pending || !toVerify.length} onClick={() => run(() => setStatus(toVerify.map((s) => s.id), 'verified'))}>
                Verify all checked ({toVerify.length})
              </button>
            </div>
            <div className="card table-wrap" style={{ padding: 0 }}>
              <table className="table" style={{ minWidth: 900 }}>
                <thead><tr><th>Heat</th><th>Lane</th><th>Team</th><th>Judge</th><th>Score</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {partRows.length === 0 && <tr><td colSpan={7} className="subtle">Nothing to show.</td></tr>}
                  {partRows.map((r) => {
                    const s = scoreOf(p.id, r.teamId)
                    const entries = s?.entries && 'kind' in s.entries ? (s.entries as Entries) : null
                    const rp = resolvePart(p, r.level) // this team's RX or Scaled version
                    const res = entries ? computeScore(rp, r.sex, entries) : null
                    const key = `${p.id}:${r.teamId}`
                    const panel = open?.startsWith(key + ':') ? open.slice(key.length + 1) : null
                    const appeal = s?.appeals.find((a) => a.status === 'open')
                    const toggle = (name: string) => setOpen(panel === name ? null : `${key}:${name}`)
                    return (
                      <FragmentRows key={key}>
                        <tr>
                          <td className="mono">{r.heat ?? '—'}</td>
                          <td className="mono">{r.lane ?? '—'}</td>
                          <td><b>{r.teamName}</b><div className="small subtle">{r.divisionName}</div></td>
                          <td className="small muted">{s?.judge?.name ?? r.judge ?? '—'}</td>
                          <td>
                            <span className="mono" style={{ fontWeight: 600 }}>{res?.display ?? '—'}</span>
                            {s?.tiebreak_value != null && <div className="small subtle">Tiebreak {s.tiebreak_value}</div>}
                            {s && s.source !== 'judge' && <div><span className="pill pill-dim">{s.source === 'paper' ? 'Paper' : 'Edited'}</span></div>}
                          </td>
                          <td>{s ? <span className={`pill ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span> : <span className="pill pill-dim">No score</span>}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
                              {s && (s.status === 'submitted' || s.status === 'draft') && (
                                <button className="btn btn-sm" disabled={pending || s.status === 'draft' || !res?.complete} onClick={() => run(() => setStatus([s.id], 'verified'))}>Verify</button>
                              )}
                              {s && <button className="linkbtn" onClick={() => toggle('detail')}>Details</button>}
                              {s?.status !== 'appeal' && <button className="linkbtn" onClick={() => toggle('edit')}>{s ? 'Edit' : 'Enter paper score'}</button>}
                              {s && s.status !== 'appeal' && s.status !== 'rejected' && <button className="linkbtn" onClick={() => toggle('appeal')}>Appeal</button>}
                              {appeal && <button className="linkbtn danger" onClick={() => toggle('resolve')}>Resolve appeal</button>}
                              {s && s.status !== 'rejected' && s.status !== 'appeal' && <button className="linkbtn danger" onClick={() => toggle('reject')}>Reject</button>}
                              {s?.status === 'rejected' && <button className="linkbtn" disabled={pending} onClick={() => run(() => setStatus([s.id], 'submitted'))}>Restore</button>}
                            </span>
                          </td>
                        </tr>
                        {panel && (
                          <tr>
                            <td colSpan={7} style={{ background: 'rgba(255,255,255,0.02)' }}>
                              {panel === 'detail' && s && <Detail score={s} detail={res?.detail ?? []} />}
                              {panel === 'edit' && (
                                <ScoreForm part={rp} sex={r.sex} entries={entries} tiebreak={s?.tiebreak_value?.toString() ?? ''} isPaper={!s} pending={pending}
                                  onCancel={() => setOpen(null)}
                                  onSave={(input, tiebreak, reason) => run(() => saveAdminScore({ partId: p.id, teamId: r.teamId, input, tiebreak, reason, source: s ? 'admin' : 'paper' }), () => setOpen(null))} />
                              )}
                              {panel === 'appeal' && s && (
                                <TextAction label="What is the appeal about?" placeholder="e.g. Team says round 3 finished at 2:41, not 2:55" button="Log appeal" pending={pending}
                                  onCancel={() => setOpen(null)} onSubmit={(text) => run(() => logAppeal(s.id, text), () => setOpen(null))} />
                              )}
                              {panel === 'reject' && s && (
                                <TextAction label="Why is this score rejected?" placeholder="e.g. Wrong lane recorded; paper score entered instead" button="Reject score" danger pending={pending}
                                  onCancel={() => setOpen(null)} onSubmit={(text) => run(() => setStatus([s.id], 'rejected', text), () => setOpen(null))} />
                              )}
                              {panel === 'resolve' && s && appeal && (
                                <Resolve appeal={appeal} part={rp} sex={r.sex} entries={entries} score={s} pending={pending} onCancel={() => setOpen(null)}
                                  onResolve={(outcome, note, correction) => run(() => resolveAppeal({ appealId: appeal.id, outcome, resolution: note, correction: correction ? { partId: p.id, teamId: r.teamId, ...correction } : undefined }), () => setOpen(null))} />
                              )}
                            </td>
                          </tr>
                        )}
                      </FragmentRows>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      {otherTeams.length > 0 && (
        <section className="card stack-sm">
          <h3>Score a team that isn’t in a heat</h3>
          <div className="row">
            <select className="input" style={{ maxWidth: 320 }} value={extraTeam} onChange={(e) => setExtraTeam(e.target.value)} aria-label="Team">
              <option value="">Choose a team…</option>
              {divisions.map((d) => (
                <optgroup key={d.id} label={d.name}>
                  {otherTeams.filter((t) => t.divisionId === d.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
            {extraTeam && <span className="small subtle">They now appear in the tables above. Use “Enter paper score”.</span>}
          </div>
        </section>
      )}
    </div>
  )
}

function FragmentRows({ children }: { children: React.ReactNode }) { return <>{children}</> }

function Detail({ score, detail }: { score: Score; detail: string[] }) {
  return (
    <div className="stack-sm small">
      {detail.length > 0 && <div>{detail.map((d) => <div key={d} className="mono">{d}</div>)}</div>}
      <div className="muted">
        {score.signed_by ? `Agreed by ${score.signed_by}. ` : ''}
        {score.submitted_at ? `Submitted ${new Date(score.submitted_at).toLocaleTimeString('en-GB')}. ` : ''}
        {score.verified_by ? `Verified by ${score.verified_by}.` : ''}
      </div>
      {score.appeals.length > 0 && (
        <div className="stack-sm">
          {score.appeals.map((a) => (
            <div key={a.id}><span className={`pill ${a.status === 'open' ? 'pill-bad' : 'pill-dim'}`}>Appeal {a.status}</span> {a.description}{a.resolution ? ` → ${a.resolution}` : ''}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScoreForm({ part, sex, entries, tiebreak, isPaper, pending, onSave, onCancel, hideReason, submitLabel }: {
  part: Part; sex: Sex; entries: Entries | null; tiebreak: string; isPaper: boolean; pending: boolean
  onSave: (input: AdminInput, tiebreak: string, reason: string) => void; onCancel: () => void; hideReason?: boolean; submitLabel?: string
}) {
  const [input, setInput] = useState<AdminInput>(() => adminInputFrom(part, sex, entries))
  const [tb, setTb] = useState(tiebreak)
  const [reason, setReason] = useState(isPaper ? 'Paper scoresheet' : '')
  const set = (patch: Partial<AdminInput>) => setInput((i) => ({ ...i, ...patch }))
  return (
    <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); onSave(input, tb, reason) }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {part.score_type === 'for_time' && input.rounds.map((v, i) => (
          <label key={i} className="field" style={{ width: 120 }}>
            <span>{input.rounds.length > 1 ? `Round ${i + 1}` : 'Time'}</span>
            <input className="input mono" value={v} placeholder="2:41.5" onChange={(e) => set({ rounds: input.rounds.map((x, k) => (k === i ? e.target.value : x)) })} />
          </label>
        ))}
        {part.score_type === 'amrap' && (<>
          <label className="field" style={{ width: 120 }}><span>Rounds</span><input className="input mono" inputMode="numeric" value={input.amrapRounds} onChange={(e) => set({ amrapRounds: e.target.value })} /></label>
          <label className="field" style={{ width: 120 }}><span>Extra reps</span><input className="input mono" inputMode="numeric" value={input.amrapReps} onChange={(e) => set({ amrapReps: e.target.value })} /></label>
        </>)}
        {part.score_type === 'max_reps' && <label className="field" style={{ width: 140 }}><span>Reps</span><input className="input mono" inputMode="numeric" value={input.reps} onChange={(e) => set({ reps: e.target.value })} /></label>}
        {part.score_type === 'max_load' && <label className="field" style={{ width: 160 }}><span>Total kg</span><input className="input mono" inputMode="decimal" value={input.kg} onChange={(e) => set({ kg: e.target.value })} /></label>}
        {part.score_type === 'other' && <label className="field" style={{ width: 160 }}><span>Score{part.unit ? ` (${part.unit})` : ''}</span><input className="input mono" inputMode="decimal" value={input.value} onChange={(e) => set({ value: e.target.value })} /></label>}
        {part.tiebreak_note && <label className="field" style={{ width: 160 }}><span>Tiebreak</span><input className="input mono" value={tb} placeholder={part.tiebreak_note} onChange={(e) => setTb(e.target.value)} /></label>}
      </div>
      {part.score_type === 'for_time' && <span className="small subtle">Type a time like 2:41.5, or “cap 28” for a {input.rounds.length > 1 ? 'round' : 'workout'} not finished in time (28 = reps done).</span>}
      {!hideReason && (
        <label className="field"><span>{isPaper ? 'Where is this score from?' : 'Reason for the change'}</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isPaper ? 'Paper scoresheet, lane 3' : 'e.g. Judge ticked deadlifts late; video shows 1:58'} />
        </label>
      )}
      <div className="row">
        <button className="btn btn-sm" disabled={pending}>{submitLabel ?? (isPaper ? 'Save paper score' : 'Save and verify')}</button>
        <button type="button" className="linkbtn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function TextAction({ label, placeholder, button, danger, pending, onSubmit, onCancel }: {
  label: string; placeholder: string; button: string; danger?: boolean; pending: boolean; onSubmit: (t: string) => void; onCancel: () => void
}) {
  const [text, setText] = useState('')
  return (
    <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); onSubmit(text) }}>
      <label className="field"><span>{label}</span><input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoFocus /></label>
      <div className="row">
        <button className={`btn btn-sm${danger ? ' btn-danger' : ''}`} disabled={pending || !text.trim()}>{button}</button>
        <button type="button" className="linkbtn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function Resolve({ appeal, part, sex, entries, score, pending, onResolve, onCancel }: {
  appeal: Appeal; part: Part; sex: Sex; entries: Entries | null; score: Score; pending: boolean
  onResolve: (outcome: 'upheld' | 'rejected', note: string, correction?: { input: AdminInput; tiebreak: string }) => void; onCancel: () => void
}) {
  const [note, setNote] = useState('')
  const [correct, setCorrect] = useState(false)
  return (
    <div className="stack-sm">
      <p className="small"><span className="pill pill-bad">Appeal</span> {appeal.description}</p>
      <label className="field"><span>Decision note (kept in the audit log)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Video checked, round 3 time corrected to 2:41" />
      </label>
      {correct ? (
        <ScoreForm part={part} sex={sex} entries={entries} tiebreak={score.tiebreak_value?.toString() ?? ''} isPaper={false} pending={pending} hideReason
          submitLabel="Uphold with this score" onCancel={() => setCorrect(false)}
          onSave={(input, tiebreak) => onResolve('upheld', note, { input, tiebreak })} />
      ) : (
        <div className="row">
          <button className="btn btn-sm" disabled={pending || !note.trim()} onClick={() => setCorrect(true)}>Uphold and correct the score</button>
          <button className="btn btn-ghost btn-sm" disabled={pending || !note.trim()} onClick={() => onResolve('rejected', note)}>Dismiss, score stands</button>
          <button className="linkbtn" onClick={onCancel}>Cancel</button>
        </div>
      )}
    </div>
  )
}
