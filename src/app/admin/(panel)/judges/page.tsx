import QRCode from 'qrcode'
import { requireStaff } from '@/lib/auth'
import type { Judge, Settings } from '@/lib/types'
import { JudgeRow } from './judge-row'
import { saveJudge } from './actions'
import { CopyLink } from './copy-link'
import { ResetScores, type ResetEvent } from './reset-scores'

export const metadata = { title: 'Judges' }

const JUDGE_URL = 'https://leaders.northernwarrior.co.uk/judge'

export default async function JudgesPage() {
  const { supabase } = await requireStaff()
  const [{ data: judges }, { data: settings }, { data: workouts }, { data: scoreRows }, { data: claimRows }] = await Promise.all([
    supabase.from('wl_judges').select('*').order('role').order('name').returns<Judge[]>(),
    supabase.from('wl_competition_settings').select('judge_code, head_judge_code').single<Pick<Settings, 'judge_code' | 'head_judge_code'>>(),
    supabase.from('wl_workouts').select('id, number, name').order('number'),
    supabase.from('wl_scores').select('id, part:wl_workout_parts(workout_id)'),
    supabase.from('wl_lane_assignments').select('id, heat:wl_heats(workout_id)').not('judge_id', 'is', null),
  ])
  const wid = (x: unknown) => (Array.isArray(x) ? x[0] : x) as { workout_id: string } | null
  const resetEvents: ResetEvent[] = (workouts ?? []).map((w) => ({
    id: w.id, number: w.number, name: w.name,
    scores: (scoreRows ?? []).filter((s) => wid(s.part)?.workout_id === w.id).length,
    claimed: (claimRows ?? []).filter((c) => wid(c.heat)?.workout_id === w.id).length,
  }))
  const qr = await QRCode.toString(JUDGE_URL, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
  const qrHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`
  const heads = judges?.filter((j) => j.role === 'head') ?? []
  const lane = judges?.filter((j) => j.role === 'lane') ?? []

  return (
    <>
      <div className="stack-sm">
        <span className="eyebrow">{lane.filter((j) => j.active).length} lane judges · {heads.filter((j) => j.active).length} head judges</span>
        <h1>Judges</h1>
      </div>

      <section className="card judge-invite">
        <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="stack-sm">
          <h2>Judge sign-up</h2>
          <p className="muted small" style={{ maxWidth: '60ch' }}>
            Judges scan this or open the link, type their name and the judge code. That signs them up; they then pick
            the event, heat and lane they’re judging. No need to add lane judges here.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <code className="mono">{JUDGE_URL}</code>
            <CopyLink text={JUDGE_URL} />
            <a className="btn btn-ghost btn-sm" href={qrHref} download="warrior-leaders-judge-qr.svg">Download QR</a>
          </div>
          <div className="row" style={{ gap: 24, marginTop: 6 }}>
            <span className="small muted">Judge code <b className="mono" style={{ color: 'var(--gold-hi)', fontSize: '1.1rem', letterSpacing: '0.15em' }}>{settings?.judge_code}</b></span>
            <span className="small muted">Head judge code <b className="mono" style={{ color: 'var(--gold-hi)', fontSize: '1.1rem', letterSpacing: '0.15em' }}>{settings?.head_judge_code}</b></span>
            <a className="small" href="/admin/settings">Change codes</a>
          </div>
        </div>
      </section>

      <section className="stack">
        <div className="stack-sm">
          <h2>Head judges</h2>
          <p className="muted small" style={{ maxWidth: '64ch' }}>
            Head judges sign in with “Head judge sign in” and the head judge code. They see every heat with its times and judges,
            every workout with its standards, and can score any lane.
          </p>
        </div>
        <form action={saveJudge} className="card grid-4" style={{ gridTemplateColumns: 'minmax(0,2fr) 130px minmax(0,1fr) minmax(0,1.5fr) auto', alignItems: 'end' }}>
          <label className="field"><span>Name</span><input id="new-judge-name" name="name" className="input" required placeholder="Full name" /></label>
          <label className="field">
            <span>Role</span>
            <select id="new-judge-role" name="role" className="input" defaultValue="head"><option value="head">Head judge</option><option value="lane">Lane judge</option></select>
          </label>
          <label className="field"><span>Phone</span><input id="new-judge-phone" name="phone" className="input" /></label>
          <label className="field"><span>Email</span><input id="new-judge-email" name="email" type="email" className="input" /></label>
          <button className="btn">Add judge</button>
        </form>
      </section>

      {(judges?.length ?? 0) === 0 ? (
        <div className="empty">No judges yet.</div>
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Status</th><th></th></tr></thead>
            <tbody>{[...heads, ...lane].map((j) => <JudgeRow key={j.id} judge={j} />)}</tbody>
          </table>
        </div>
      )}
      <p className="small subtle">Lane judges appear here once they sign up. Switching one off signs them out and stops them signing back in with that name.</p>

      <ResetScores events={resetEvents} />
    </>
  )
}
