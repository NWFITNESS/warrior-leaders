import { requireStaff } from '@/lib/auth'
import { EmailComposer } from './composer'

export const metadata = { title: 'Emails' }

export default async function EmailsPage() {
  const { supabase, actor } = await requireStaff()
  const [{ data: divisions }, { data: teams }] = await Promise.all([
    supabase.from('wl_divisions').select('id, name').order('sort_order'),
    supabase.from('wl_teams').select('id, name, division_id').order('name'),
  ])
  return (
    <>
      <div className="stack-sm">
        <span className="eyebrow">Communication</span>
        <h1>Emails</h1>
        <p className="small muted" style={{ maxWidth: '70ch' }}>
          Send updates to athletes from noreply@northernwarrior.co.uk (replies go to info@northernwarrior.co.uk). Each email is personalised with the athlete’s name, team and heat times.
        </p>
      </div>
      {!process.env.RESEND_API_KEY && (
        <p className="notice notice-bad">Sending is switched off until <b>RESEND_API_KEY</b> is added to the warrior-leaders project in Vercel (same key as NWHub). You can still write and preview emails.</p>
      )}
      <EmailComposer divisions={divisions ?? []} teams={teams ?? []} me={actor} />
    </>
  )
}
