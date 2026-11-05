'use client'

import { useState, useTransition } from 'react'
import { checkDelivery } from './actions'

export interface LogEntry {
  id: string; created_at: string; actor: string; mode: 'test' | 'all'; audience_label: string | null; subject: string
  attachments: { filename: string; size: number }[]
  recipients: { email: string; name: string; team: string; resend_id: string | null; error: string | null; last_event?: string; checked_at?: string }[]
  sent: number; failed: number
}

const EVENT: Record<string, [string, string]> = {
  delivered: ['Delivered', 'ok'], opened: ['Opened', 'ok'], clicked: ['Clicked', 'ok'],
  sent: ['Sent', ''], queued: ['Queued', ''], scheduled: ['Scheduled', ''],
  delivery_delayed: ['Delayed', 'warn'], bounced: ['Bounced', 'bad'], complained: ['Marked spam', 'bad'], failed: ['Failed', 'bad'],
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })

/** Admin → Emails: every send, who it went to, and (on request) what Resend says happened to each email. */
export function EmailLog({ entries }: { entries: LogEntry[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [, start] = useTransition()

  if (!entries.length) return <div className="empty">Nothing sent yet. Every send (including tests) will show here.</div>

  return (
    <div className="stack-sm">
      {err && <p className="notice notice-bad">{err}</p>}
      {entries.map((e) => {
        const delivered = e.recipients.filter((r) => r.last_event && ['delivered', 'opened', 'clicked'].includes(r.last_event)).length
        const bounced = e.recipients.filter((r) => r.last_event === 'bounced' || r.last_event === 'complained').length
        const checked = e.recipients.some((r) => r.checked_at)
        return (
          <details key={e.id} className="card email-log">
            <summary>
              <span className="when mono">{when(e.created_at)}</span>
              <span className="subj"><b>{e.mode === 'test' ? '[TEST] ' : ''}{e.subject}</b><small>{e.audience_label ?? ''}{e.attachments.length ? ` · 📎 ${e.attachments.map((a) => a.filename).join(', ')}` : ''} · by {e.actor}</small></span>
              <span className="nums">
                <span className="ok">{e.sent} sent</span>
                {e.failed > 0 && <span className="bad">{e.failed} failed</span>}
                {checked && <span className="ok">{delivered} delivered</span>}
                {bounced > 0 && <span className="bad">{bounced} bounced</span>}
              </span>
            </summary>
            <div className="stack-sm" style={{ paddingTop: 12 }}>
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy}
                  onClick={() => { setErr(''); setBusy(e.id); start(async () => { const r = await checkDelivery(e.id); if (r.error) setErr(r.error); setBusy(null) }) }}>
                  {busy === e.id ? 'Checking with Resend…' : checked ? 'Check delivery again' : 'Check delivery'}
                </button>
                <span className="small subtle">Asks Resend whether each email was delivered, bounced or opened. Takes about half a second per email.</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Email</th><th>Athlete</th><th>Team</th><th>Status</th></tr></thead>
                  <tbody>
                    {e.recipients.map((r, i) => {
                      const ev = r.error ? ['Not sent', 'bad'] : r.last_event ? EVENT[r.last_event] ?? [r.last_event, ''] : ['Accepted by Resend', '']
                      return (
                        <tr key={i}>
                          <td className="small">{r.email}</td>
                          <td className="small">{r.name}</td>
                          <td className="small muted">{r.team}</td>
                          <td className="small"><span className={`dot-status ${ev[1]}`}>{ev[0]}</span>{r.error && <div className="small subtle">{r.error}</div>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        )
      })}
    </div>
  )
}
