import { requireStaff } from '@/lib/auth'

export const metadata = { title: 'Audit log' }
export const dynamic = 'force-dynamic'

const LABELS: Record<string, string> = {
  'score.verified': 'Verified score', 'score.submitted': 'Reopened score', 'score.rejected': 'Rejected score', 'score.edit': 'Edited score',
  'score.paper': 'Entered paper score', 'score.admin': 'Entered score', 'appeal.open': 'Logged appeal', 'appeal.upheld': 'Upheld appeal',
  'appeal.rejected': 'Dismissed appeal', 'results.release': 'Released results', 'results.unrelease': 'Unreleased results',
  'heats.save': 'Saved heats', 'settings.update': 'Changed settings', 'team.import': 'Imported teams', 'team.create': 'Added team',
  'team.update': 'Edited team', 'team.delete': 'Deleted team', 'workout.create': 'Created workout', 'workout.update': 'Edited workout',
  'workout.delete': 'Deleted workout', 'workout.duplicate': 'Duplicated workout', 'judge.create': 'Added judge', 'judge.update': 'Edited judge',
  'judge.delete': 'Deleted judge', 'judge.activate': 'Activated judge', 'judge.deactivate': 'Deactivated judge', 'email.send': 'Sent email',
}

export default async function AuditPage() {
  const { supabase } = await requireStaff()
  const { data: rows } = await supabase.from('wl_audit_log').select('id, actor, action, entity, entity_id, reason, after, created_at').order('created_at', { ascending: false }).limit(300)

  return (
    <>
      <div className="stack-sm">
        <span className="eyebrow">Records</span>
        <h1>Audit log</h1>
        <p className="small muted">Every change made in the admin, newest first. Judge taps are stored with each score (see Scores → Details).</p>
      </div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="table" style={{ minWidth: 760 }}>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Reason / detail</th></tr></thead>
          <tbody>
            {(rows ?? []).length === 0 && <tr><td colSpan={4} className="subtle">Nothing yet.</td></tr>}
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="mono small" style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                <td className="small muted">{r.actor}</td>
                <td>{LABELS[r.action] ?? r.action}</td>
                <td className="small muted" style={{ maxWidth: 480 }}>
                  {r.reason ?? ''}
                  {r.action === 'score.edit' || r.action === 'score.paper' ? ` ${(r.after as { display?: string } | null)?.display ?? ''}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
