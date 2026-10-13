'use server'

import { requireStaff } from '@/lib/auth'
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
    supabase.from('wl_lane_assignments').select('lane, team_id, heat:wl_heats(number, start_time, workout:wl_workouts(number, name))'),
  ])
  type Lane = { lane: number; team_id: string; heat: { number: number; start_time: string | null; workout: { number: number; name: string } } }
  const heatsFor = (teamId: string) => ((lanes ?? []) as unknown as Lane[])
    .filter((l) => l.team_id === teamId)
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
<tr><td style="background:#0a0a0a;padding:22px;text-align:center"><img src="${SITE}/nw-competitions-logo-900.png" width="220" alt="Northern Warrior Competitions" style="display:inline-block;width:220px;height:auto"></td></tr>
<tr><td style="padding:26px 26px 10px;font-size:15px">${paragraphs}</td></tr>
<tr><td style="padding:0 26px 26px"><a href="${SITE}/teams/${r.teamId}" style="display:inline-block;background:#c9a70a;color:#0a0a0a;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">View your team page</a></td></tr>
<tr><td style="padding:16px 26px;background:#fafafa;font-size:12px;color:#777">The Warrior Leaders · Northern Warrior. You’re receiving this because you entered the competition. Reply to this email with any questions.</td></tr>
</table></td></tr></table></body></html>`
  return { subject: fill(draft.subject, r), html, text: `${text}\n\nYour team page: ${SITE}/teams/${r.teamId}` }
}

export async function previewEmail(draft: EmailDraft) {
  const list = await recipients(draft.audience)
  const sample = list[0]
  return { count: list.length, preview: sample ? { to: sample.email, ...render(draft, sample) } : null }
}

async function send(batch: { from: string; to: string[]; subject: string; html: string; text: string; reply_to: string }[]) {
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

export async function sendEmail(draft: EmailDraft, mode: 'test' | 'all'): Promise<{ ok?: boolean; sent?: number; error?: string }> {
  const { supabase, actor } = await requireStaff()
  if (!process.env.RESEND_API_KEY) return { error: 'Email isn’t switched on yet: add RESEND_API_KEY to the Vercel project.' }
  if (!draft.subject.trim() || !draft.body.trim()) return { error: 'Add a subject and a message.' }
  const list = await recipients(draft.audience)
  if (!list.length) return { error: 'No athletes with an email address in that group.' }

  try {
    if (mode === 'test') {
      const r = render(draft, list[0])
      await send([{ from: FROM, to: [actor], subject: `[TEST] ${r.subject}`, html: r.html, text: r.text, reply_to: REPLY_TO }])
      return { ok: true, sent: 1 }
    }
    for (let i = 0; i < list.length; i += 100) {
      await send(list.slice(i, i + 100).map((r) => { const m = render(draft, r); return { from: FROM, to: [r.email], subject: m.subject, html: m.html, text: m.text, reply_to: REPLY_TO } }))
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Sending failed.' }
  }
  await audit(supabase, { actor, action: 'email.send', entity: 'email', reason: `${draft.subject} → ${list.length} recipients (${draft.audience})`, after: { audience: draft.audience, subject: draft.subject, count: list.length } })
  return { ok: true, sent: list.length }
}
