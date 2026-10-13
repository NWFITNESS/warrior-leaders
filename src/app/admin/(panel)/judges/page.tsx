import { requireStaff } from '@/lib/auth'
import type { Judge, Settings } from '@/lib/types'
import { JudgeRow } from './judge-row'
import { saveJudge } from './actions'

export const metadata = { title: 'Judges' }

export default async function JudgesPage() {
  const { supabase } = await requireStaff()
  const [{ data: judges }, { data: settings }] = await Promise.all([
    supabase.from('wl_judges').select('*').order('role').order('name').returns<Judge[]>(),
    supabase.from('wl_competition_settings').select('judge_code').single<Pick<Settings, 'judge_code'>>(),
  ])

  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">{judges?.filter((j) => j.active).length ?? 0} active</span>
          <h1>Judges</h1>
          <p className="muted small" style={{ maxWidth: '64ch' }}>
            Judges pick their name in the judge app and enter today’s judge code
            (<b className="mono" style={{ color: 'var(--gold-hi)' }}>{settings?.judge_code}</b>, change it in Settings).
            Inactive judges don’t appear in the list.
          </p>
        </div>
      </div>

      <form action={saveJudge} className="card grid-4" style={{ gridTemplateColumns: 'minmax(0,2fr) 130px minmax(0,1fr) minmax(0,1.5fr) auto', alignItems: 'end' }}>
        <label className="field"><span>Name</span><input id="new-judge-name" name="name" className="input" required placeholder="Full name" /></label>
        <label className="field">
          <span>Role</span>
          <select id="new-judge-role" name="role" className="input"><option value="lane">Lane judge</option><option value="head">Head judge</option></select>
        </label>
        <label className="field"><span>Phone</span><input id="new-judge-phone" name="phone" className="input" /></label>
        <label className="field"><span>Email</span><input id="new-judge-email" name="email" type="email" className="input" /></label>
        <button className="btn">Add judge</button>
      </form>

      {(judges?.length ?? 0) === 0 ? (
        <div className="empty">No judges yet. Add them above.</div>
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Status</th><th></th></tr></thead>
            <tbody>{judges!.map((j) => <JudgeRow key={j.id} judge={j} />)}</tbody>
          </table>
        </div>
      )}
    </>
  )
}
