'use client'

import { useState, useTransition } from 'react'
import type { Judge } from '@/lib/types'
import { deleteJudge, saveJudge, toggleJudge } from './actions'

export function JudgeRow({ judge }: { judge: Judge }) {
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()

  if (editing) {
    return (
      <tr>
        <td colSpan={6}>
          <form action={(fd) => start(async () => { await saveJudge(fd); setEditing(false) })} className="row">
            <input type="hidden" name="id" value={judge.id} />
            <input name="name" defaultValue={judge.name} className="input" style={{ maxWidth: 220 }} required aria-label="Name" />
            <select name="role" defaultValue={judge.role} className="input" style={{ maxWidth: 140 }} aria-label="Role">
              <option value="lane">Lane judge</option><option value="head">Head judge</option>
            </select>
            <input name="phone" defaultValue={judge.phone ?? ''} className="input" style={{ maxWidth: 160 }} aria-label="Phone" placeholder="Phone" />
            <input name="email" defaultValue={judge.email ?? ''} className="input" style={{ maxWidth: 220 }} aria-label="Email" placeholder="Email" />
            <input type="hidden" name="active" value={judge.active ? 'on' : 'off'} />
            <button className="btn btn-sm" disabled={pending}>Save</button>
            <button type="button" className="linkbtn" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ opacity: judge.active ? 1 : 0.5 }}>
      <td style={{ fontWeight: 600 }}>{judge.name}</td>
      <td>{judge.role === 'head' ? <span className="pill pill-gold">Head judge</span> : 'Lane judge'}</td>
      <td className="small muted">{judge.phone ?? '—'}</td>
      <td className="small muted">{judge.email ?? '—'}</td>
      <td>
        <button className="linkbtn" disabled={pending} onClick={() => start(() => toggleJudge(judge.id, !judge.active))}>
          {judge.active ? <span className="pill pill-ok">Active</span> : <span className="pill pill-dim">Inactive</span>}
        </button>
      </td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {confirm ? (
          <>
            <button className="linkbtn danger" onClick={() => start(() => deleteJudge(judge.id))}>Delete {judge.name}?</button>{' '}
            <button className="linkbtn" onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <>
            <button className="linkbtn" onClick={() => setEditing(true)}>Edit</button>{' · '}
            <button className="linkbtn danger" onClick={() => setConfirm(true)}>Delete</button>
          </>
        )}
      </td>
    </tr>
  )
}
