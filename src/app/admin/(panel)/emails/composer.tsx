'use client'

import { useEffect, useState, useTransition } from 'react'
import { previewEmail, sendEmail, type EmailDraft } from './actions'

const TEMPLATES: { name: string; subject: string; body: string }[] = [
  {
    name: 'Heat times',
    subject: 'Your heat times for The Warrior Leaders',
    body: `Hi {first_name},

Here are the heat times for {team} ({division}):

{heats}

Please arrive at least 30 minutes before your first heat and check in at the desk.

Follow the live leaderboard on the day at https://leaders.northernwarrior.co.uk

See you on the floor,
Northern Warrior`,
  },
  {
    name: 'General update',
    subject: 'The Warrior Leaders: update',
    body: `Hi {first_name},

`,
  },
  {
    name: 'Final results',
    subject: 'The Warrior Leaders: final results',
    body: `Hi {first_name},

Thank you for competing at The Warrior Leaders. The final results are now on the leaderboard: https://leaders.northernwarrior.co.uk

See how {team} got on: {team_link}

Northern Warrior`,
  },
]

export function EmailComposer({ divisions, teams, me }: { divisions: { id: string; name: string }[]; teams: { id: string; name: string; division_id: string }[]; me: string }) {
  const [draft, setDraft] = useState<EmailDraft>({ audience: 'all', subject: TEMPLATES[0].subject, body: TEMPLATES[0].body })
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewEmail>> | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [pending, start] = useTransition()

  useEffect(() => {
    const id = window.setTimeout(() => { previewEmail(draft).then(setPreview, () => setPreview(null)) }, 400)
    return () => window.clearTimeout(id)
  }, [draft])

  const set = (patch: Partial<EmailDraft>) => { setDraft((d) => ({ ...d, ...patch })); setConfirm(false); setMsg({}) }
  const doSend = (mode: 'test' | 'all') => start(async () => {
    const res = await sendEmail(draft, mode)
    setConfirm(false)
    setMsg(res.error ? { error: res.error } : { ok: mode === 'test' ? `Test sent to ${me}.` : `Sent to ${res.sent} athletes.` })
  })

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="card stack">
        <div className="field">
          <span>Start from</span>
          <div className="seg">
            {TEMPLATES.map((t) => <button key={t.name} type="button" onClick={() => set({ subject: t.subject, body: t.body })}>{t.name}</button>)}
          </div>
        </div>
        <label className="field">
          <span>Send to</span>
          <select id="email-audience" className="input" value={draft.audience} onChange={(e) => set({ audience: e.target.value })}>
            <option value="all">All athletes</option>
            <option value="captains">Team captains only</option>
            <optgroup label="Division">
              {divisions.map((d) => <option key={d.id} value={`division:${d.id}`}>{d.name}</option>)}
            </optgroup>
            <optgroup label="One team">
              {teams.map((t) => <option key={t.id} value={`team:${t.id}`}>{t.name}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="field"><span>Subject</span><input id="email-subject" className="input" value={draft.subject} onChange={(e) => set({ subject: e.target.value })} /></label>
        <label className="field">
          <span>Message</span>
          <textarea id="email-body" className="input" rows={14} value={draft.body} onChange={(e) => set({ body: e.target.value })} />
        </label>
        <p className="small subtle">Personalise with {'{first_name}'}, {'{team}'}, {'{division}'}, {'{heats}'} (their heat times) and {'{team_link}'}.</p>
        {msg.error && <p className="notice notice-bad">{msg.error}</p>}
        {msg.ok && <p className="notice notice-ok">{msg.ok}</p>}
        <div className="row">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => doSend('test')}>Send me a test</button>
          {confirm ? (
            <>
              <button type="button" className="btn" disabled={pending} onClick={() => doSend('all')}>{pending ? 'Sending…' : `Yes, send to ${preview?.count ?? 0}`}</button>
              <button type="button" className="linkbtn" onClick={() => setConfirm(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="btn" disabled={pending || !preview?.count} onClick={() => setConfirm(true)}>Send to {preview?.count ?? 0} athletes</button>
          )}
        </div>
      </div>
      <div className="stack-sm">
        <span className="eyebrow">Preview{preview?.preview ? ` · as ${preview.preview.to}` : ''}</span>
        {preview?.preview ? (
          <>
            <div className="small"><b>Subject:</b> {preview.preview.subject}</div>
            <iframe title="Email preview" sandbox="" srcDoc={preview.preview.html} style={{ width: '100%', height: 640, border: '1px solid var(--line-2)', borderRadius: 10, background: '#f4f4f4' }} />
          </>
        ) : <div className="empty">No athletes with an email address in that group.</div>}
      </div>
    </div>
  )
}
