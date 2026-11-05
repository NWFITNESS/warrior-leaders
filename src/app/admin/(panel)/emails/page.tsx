import { requireStaff } from '@/lib/auth'
import { EmailComposer } from './composer'
import { EmailLog, type LogEntry } from './email-log'

export const metadata = { title: 'Emails' }
export const dynamic = 'force-dynamic'
// sends with attachments go one at a time (~2/second); give a full send room to finish
export const maxDuration = 300

export default async function EmailsPage() {
  const { supabase, actor } = await requireStaff()
  const [{ data: divisions }, { data: teams }] = await Promise.all([
    supabase.from('wl_divisions').select('id, name').order('sort_order'),
    supabase.from('wl_teams').select('id, name, division_id').order('name'),
  ])
  const { data: log } = await supabase.from('wl_email_log').select('*').order('created_at', { ascending: false }).limit(50)
  return (
    <>
      <div className="stack-sm">
        <span className="eyebrow">Communication</span>
        <h1>Emails</h1>
        <p className="small muted" style={{ maxWidth: '70ch' }}>
          Send updates to athletes from Northern Warrior Competitions (noreply@northernwarrior.co.uk; replies go to info@northernwarrior.co.uk). Each email is personalised with the athlete’s name, team and heat times.
        </p>
      </div>
      {!process.env.RESEND_API_KEY && (
        <p className="notice notice-bad">Sending is switched off until <b>RESEND_API_KEY</b> is added to the warrior-leaders project in Vercel (same key as NWHub). You can still write and preview emails.</p>
      )}
      <EmailComposer divisions={divisions ?? []} teams={teams ?? []} me={actor} />

      <section className="stack-sm" style={{ marginTop: 12 }}>
        <h2>Sent emails</h2>
        <p className="small muted">Every send, newest first. Open one to see each recipient; “Check delivery” asks Resend what happened to each email.</p>
        <EmailLog entries={(log ?? []) as LogEntry[]} />
      </section>
    </>
  )
}
