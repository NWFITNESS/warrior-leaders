'use server'

import { requireStaff } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'

const SITE = 'https://leaders.northernwarrior.co.uk'
const FROM = 'Northern Warrior Competitions <noreply@northernwarrior.co.uk>'
const REPLY_TO = 'info@northernwarrior.co.uk'

export interface EmailDraft { audience: string; subject: string; body: string }
interface Recipient { email: string; firstName: string; team: string; teamId: string; division: string; heats: string[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function recipients(audience: string): Promise<Recipient[]> {
  const { supabase } = await requireStaff()
  let q = supabase.from('wl_teams').select('id, name, division_id, division:wl_divisions(name), athletes:wl_athletes(first_name, email, is_captain)')
  if (audience.startsWith('division:')) q = q.eq('division_id', audience.slice(9))
  if (audience.startsWith('team:')) q = q.eq('id', audience.slice(5))
  const [{ data: teams }, { data: lanes }] = await Promise.all([
    q,
    supabase.from('wl_lane_assignments').select('lane, team_id, heat:wl_heats(number, start_time, workout:wl_workouts(number, name, open_entry))'),
  ])
  type Lane = { lane: number; team_id: string; heat: { number: number; start_time: string | null; workout: { number: number; name: string; open_entry: boolean } } }
  const heatsFor = (teamId: string) => ((lanes ?? []) as unknown as Lane[])
    .filter((l) => l.team_id === teamId && !l.heat.workout.open_entry) // side events have no real heat
    .sort((a, b) => a.heat.workout.number - b.heat.workout.number)
    .map((l) => `Event ${l.heat.workout.number} (${l.heat.workout.name}): ${l.heat.start_time ? l.heat.start_time.slice(0, 5) : 'time TBC'} · Heat ${l.heat.number} · Lane ${l.lane}`)

  const out: Recipient[] = []
  const seen = new Set<string>()
  for (const t of (teams ?? []) as unknown as { id: string; name: string; division: { name: string }; athletes: { first_name: string; email: string | null; is_captain: boolean }[] }[]) {
    for (const a of t.athletes) {
      if (!a.email || (audience === 'captains' && !a.is_captain)) continue
      const key = a.email.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ email: a.email, firstName: a.first_name, team: t.name, teamId: t.id, division: t.division.name, heats: heatsFor(t.id) })
    }
  }
  return out
}

function fill(text: string, r: Recipient) {
  return text
    .replaceAll('{first_name}', r.firstName)
    .replaceAll('{team}', r.team)
    .replaceAll('{division}', r.division)
    .replaceAll('{team_link}', `${SITE}/teams/${r.teamId}`)
    .replaceAll('{heats}', r.heats.length ? r.heats.join('\n') : 'Heat times to be confirmed.')
}

function render(draft: EmailDraft, r: Recipient) {
  const text = fill(draft.body, r)
  const paragraphs = text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p).replace(/\n/g, '<br>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#967705">$1</a>')}</p>`).join('')
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0a0a0a;padding:22px;text-align:center"><img src="${SITE}/brand/logo-horizontal-email.png" width="300" height="61" alt="Warrior Leaders" style="display:inline-block;width:300px;height:auto"></td></tr>
<tr><td style="padding:26px 26px 10px;font-size:15px">${paragraphs}</td></tr>
<tr><td style="padding:0 26px 26px"><a href="${SITE}/teams/${r.teamId}" style="display:inline-block;background:#c9a70a;color:#0a0a0a;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">View your team page</a></td></tr>
<tr><td style="padding:16px 26px;background:#fafafa;font-size:12px;color:#777">Warrior Leaders · Northern Warrior Competitions. You’re receiving this because you entered the competition. Reply to this email with any questions.</td></tr>
</table></td></tr></table></body></html>`
  return { subject: fill(draft.subject, r), html, text: `${text}\n\nYour team page: ${SITE}/teams/${r.teamId}` }
}

export async function previewEmail(draft: EmailDraft) {
  const list = await recipients(draft.audience)
  const sample = list[0]
  return { count: list.length, preview: sample ? { to: sample.email, ...render(draft, sample) } : null }
}

/** The key as pasted into Vercel, minus stray spaces / quotes / line breaks. */
const resendKey = () => (process.env.RESEND_API_KEY ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim()

export interface EmailAttachment { filename: string; content: string /* base64 */; size: number }
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 // all files together

type Message = { from: string; to: string[]; subject: string; html: string; text: string; reply_to: string; attachments?: { filename: string; content: string }[] }
type Outcome = { email: string; name: string; team: string; resend_id: string | null; error: string | null }

async function resendError(res: Response) {
  // admin-only hint so a wrong key can be matched against Resend's list (never the whole key)
  const k = resendKey()
  const hint = res.status === 401 ? ` · key in use starts "${k.slice(0, 7)}…", ${k.length} characters${/\s/.test(k) ? ', contains a space' : ''}` : ''
  return `Resend ${res.status}: ${(await res.text()).slice(0, 200)}${hint}`
}

/** Up to 100 emails in one call (no attachments). Returns Resend's id for each, in order. */
async function sendBatch(batch: Message[]): Promise<{ ids: (string | null)[]; error: string | null }> {
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  })
  if (!res.ok) return { ids: batch.map(() => null), error: await resendError(res) }
  const json = await res.json().catch(() => null) as { data?: { id: string }[] } | null
  return { ids: batch.map((_, i) => json?.data?.[i]?.id ?? null), error: null }
}

/** One email (needed for attachments: Resend's batch call doesn't take them). */
async function sendOne(m: Message): Promise<{ id: string | null; error: string | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(m),
    })
    if (res.status === 429) { await sleep(1200); continue } // rate limited: wait and retry
    if (!res.ok) return { id: null, error: await resendError(res) }
    const json = await res.json().catch(() => null) as { id?: string } | null
    return { id: json?.id ?? null, error: null }
  }
  return { id: null, error: 'Resend kept rate-limiting this one.' }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function audienceLabel(audience: string) {
  const { supabase } = await requireStaff()
  if (audience === 'all') return 'All athletes'
  if (audience === 'captains') return 'Team captains'
  if (audience.startsWith('division:')) return (await supabase.from('wl_divisions').select('name').eq('id', audience.slice(9)).single()).data?.name ?? 'Division'
  if (audience.startsWith('team:')) return (await supabase.from('wl_teams').select('name').eq('id', audience.slice(5)).single()).data?.name ?? 'Team'
  return audience
}

export async function sendEmail(draft: EmailDraft, mode: 'test' | 'all', files: EmailAttachment[] = []): Promise<{ ok?: boolean; sent?: number; failed?: number; error?: string }> {
  const { supabase, actor } = await requireStaff()
  if (!resendKey()) return { error: 'Email isn’t switched on yet: add RESEND_API_KEY to the Vercel project.' }
  if (!draft.subject.trim() || !draft.body.trim()) return { error: 'Add a subject and a message.' }
  const totalBytes = files.reduce((n, f) => n + Math.floor((f.content.length * 3) / 4), 0)
  if (totalBytes > MAX_ATTACHMENT_BYTES) return { error: 'Attachments are too big: keep them under 8 MB in total.' }
  const attachments = files.map((f) => ({ filename: f.filename.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120), content: f.content }))

  const list = await recipients(draft.audience)
  if (!list.length) return { error: 'No athletes with an email address in that group.' }

  const targets = mode === 'test' ? [{ ...list[0], email: actor }] : list
  const message = (r: Recipient): Message => {
    const m = render(draft, r)
    return { from: FROM, to: [r.email], subject: mode === 'test' ? `[TEST] ${m.subject}` : m.subject, html: m.html, text: m.text, reply_to: REPLY_TO, ...(attachments.length ? { attachments } : {}) }
  }

  const outcomes: Outcome[] = []
  if (attachments.length) {
    for (const [i, r] of targets.entries()) {
      if (i) await sleep(550) // Resend allows ~2 per second
      const res = await sendOne(message(r))
      outcomes.push({ email: r.email, name: r.firstName, team: r.team, resend_id: res.id, error: res.error })
    }
  } else {
    for (let i = 0; i < targets.length; i += 100) {
      const chunk = targets.slice(i, i + 100)
      const res = await sendBatch(chunk.map(message))
      chunk.forEach((r, j) => outcomes.push({ email: r.email, name: r.firstName, team: r.team, resend_id: res.ids[j], error: res.error }))
    }
  }

  const sent = outcomes.filter((o) => !o.error).length
  const failed = outcomes.length - sent
  await supabase.from('wl_email_log').insert({
    actor, mode, audience: draft.audience, audience_label: mode === 'test' ? `Test to ${actor}` : await audienceLabel(draft.audience),
    subject: draft.subject, attachments: files.map((f) => ({ filename: f.filename, size: f.size })), recipients: outcomes, sent, failed,
  })
  revalidatePath('/admin/emails')

  if (mode === 'all') {
    await audit(supabase, { actor, action: 'email.send', entity: 'email', reason: `${draft.subject} → ${sent} sent, ${failed} failed (${draft.audience})`, after: { audience: draft.audience, subject: draft.subject, sent, failed, attachments: files.map((f) => f.filename) } })
  }
  if (!sent) return { error: outcomes[0]?.error ?? 'Sending failed.' }
  return { ok: true, sent, failed }
}

/** Ask Resend what happened to each email in a send (delivered, bounced…). Saved on the log entry. */
export async function checkDelivery(logId: string): Promise<{ ok?: boolean; error?: string }> {
  const { supabase } = await requireStaff()
  if (!resendKey()) return { error: 'Email isn’t switched on.' }
  const { data: log } = await supabase.from('wl_email_log').select('recipients').eq('id', logId).single()
  if (!log) return { error: 'Log entry not found.' }
  const recips = log.recipients as (Outcome & { last_event?: string; checked_at?: string })[]
  for (const [i, r] of recips.entries()) {
    if (!r.resend_id || r.last_event === 'delivered' || r.last_event === 'bounced') continue
    if (i) await sleep(550)
    const res = await fetch(`https://api.resend.com/emails/${r.resend_id}`, { headers: { Authorization: `Bearer ${resendKey()}` } })
    if (res.status === 429) { await sleep(1200); continue }
    if (!res.ok) continue
    const json = await res.json().catch(() => null) as { last_event?: string } | null
    if (json?.last_event) { r.last_event = json.last_event; r.checked_at = new Date().toISOString() }
  }
  await supabase.from('wl_email_log').update({ recipients: recips }).eq('id', logId)
  revalidatePath('/admin/emails')
  return { ok: true }
}
