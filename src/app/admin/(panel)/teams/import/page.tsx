import { requireStaff } from '@/lib/auth'
import { TEMPLATE_HEADERS } from '@/lib/csv'
import { ImportForm } from './import-form'

export const metadata = { title: 'Import teams' }

export default async function ImportPage() {
  const { supabase } = await requireStaff()
  const { data: divisions } = await supabase.from('wl_divisions').select('name').order('sort_order')
  return (
    <>
      <div className="stack-sm">
        <span className="eyebrow">Teams</span>
        <h1>Import teams</h1>
        <p className="muted" style={{ maxWidth: '68ch' }}>
          Drop in the athlete export from your entry platform (.xlsx), or a CSV. Either one row per athlete with a Team Name column (athletes are paired up by team name and division), or one row per team using the template. You’ll see a preview before anything is saved.
        </p>
      </div>
      <div className="card stack-sm">
        <span className="eyebrow">Columns</span>
        <p className="mono small" style={{ wordBreak: 'break-word' }}>{TEMPLATE_HEADERS.join(', ')}</p>
        <p className="small muted">
          Division must match one of: {(divisions ?? []).map((d) => d.name).join(', ')}. Athlete 1 becomes the captain.
          A single <span className="mono">athlete1_name</span> column with the full name also works. <a href="/admin/teams/import/template">Download the template</a>.
        </p>
      </div>
      <ImportForm />
    </>
  )
}
