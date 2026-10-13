'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { Division, Team } from '@/lib/types'
import { deleteTeam, saveTeam, type TeamInput } from './actions'

type AthleteDraft = TeamInput['athletes'][number]
const blank = (captain = false): AthleteDraft => ({ first_name: '', last_name: '', email: '', phone: '', is_captain: captain })

export function TeamForm({ divisions, team }: { divisions: Division[]; team?: Team }) {
  const [name, setName] = useState(team?.name ?? '')
  const [divisionId, setDivisionId] = useState(team?.division_id ?? divisions[0]?.id ?? '')
  const [bib, setBib] = useState(team?.bib?.toString() ?? '')
  const [notes, setNotes] = useState(team?.notes ?? '')
  const [athletes, setAthletes] = useState<AthleteDraft[]>(
    team?.athletes?.length
      ? [...team.athletes].sort((a, b) => a.position - b.position).map((a) => ({ ...a }))
      : [blank(true), blank()]
  )
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, start] = useTransition()

  const setAthlete = (i: number, patch: Partial<AthleteDraft>) =>
    setAthletes((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : patch.is_captain ? { ...a, is_captain: false } : a)))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    start(async () => {
      const res = await saveTeam({
        id: team?.id,
        name,
        division_id: divisionId,
        bib: bib.trim() ? Number(bib) : null,
        notes,
        athletes,
      })
      if (res?.error) setError(res.error)
    })
  }

  return (
    <form onSubmit={submit} className="stack" style={{ maxWidth: 820 }}>
      <div className="card stack">
        <div className="grid-3">
          <label className="field" style={{ gridColumn: 'span 1' }}>
            <span>Team name</span>
            <input id="team-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>Division</span>
            <select id="team-division" className="input" value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Bib / team number</span>
            <input id="team-bib" className="input" inputMode="numeric" value={bib} onChange={(e) => setBib(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        <label className="field">
          <span>Notes (admin only)</span>
          <textarea id="team-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="card stack">
        <div className="spread">
          <h2>Athletes</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAthletes((l) => [...l, blank()])}>Add athlete</button>
        </div>
        {athletes.map((a, i) => (
          <div key={i} className="stack-sm" style={{ borderTop: i ? '1px solid var(--line)' : 0, paddingTop: i ? 14 : 0 }}>
            <div className="spread" style={{ alignItems: 'center' }}>
              <span className="eyebrow">Athlete {i + 1}</span>
              <div className="row">
                <label className="check">
                  <input type="radio" name="captain" checked={a.is_captain} onChange={() => setAthlete(i, { is_captain: true })} />
                  Captain
                </label>
                {athletes.length > 1 && (
                  <button type="button" className="linkbtn danger" onClick={() => setAthletes((l) => l.filter((_, j) => j !== i))}>Remove</button>
                )}
              </div>
            </div>
            <div className="grid-4">
              <label className="field"><span>First name</span><input id={`a${i}-first`} className="input" value={a.first_name} onChange={(e) => setAthlete(i, { first_name: e.target.value })} /></label>
              <label className="field"><span>Last name</span><input id={`a${i}-last`} className="input" value={a.last_name} onChange={(e) => setAthlete(i, { last_name: e.target.value })} /></label>
              <label className="field"><span>Email</span><input id={`a${i}-email`} type="email" className="input" value={a.email ?? ''} onChange={(e) => setAthlete(i, { email: e.target.value })} /></label>
              <label className="field"><span>Phone</span><input id={`a${i}-phone`} className="input" value={a.phone ?? ''} onChange={(e) => setAthlete(i, { phone: e.target.value })} /></label>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="notice notice-bad">{error}</p>}
      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="row">
          <button className="btn" disabled={pending}>{pending ? 'Saving…' : team ? 'Save team' : 'Add team'}</button>
          <Link href="/admin/teams" className="btn btn-ghost">Cancel</Link>
        </div>
        {team && (
          confirmDelete ? (
            <div className="row">
              <span className="small muted">Delete {team.name} and its athletes?</span>
              <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => start(() => deleteTeam(team.id))}>Yes, delete</button>
              <button type="button" className="linkbtn" onClick={() => setConfirmDelete(false)}>Keep</button>
            </div>
          ) : (
            <button type="button" className="linkbtn danger" onClick={() => setConfirmDelete(true)}>Delete team</button>
          )
        )}
      </div>
    </form>
  )
}
