import { requireStaff } from '@/lib/auth'
import { TEMPLATE_HEADERS } from '@/lib/csv'
import { ImportForm } from './import-form'

export const metadata = { title: 'Import teams' }

export default async function ImportPage() {
  const { supabase } = await requireStaff()
  const { data: divisions } = await supabase.from('divisions').select('name').order('sort_order')
  return (
    <>
      <div className="stack-sm">
        <span className="eyebrow">Teams</span>
        <h1>Import teams from CSV</h1>
        <p className="muted" style={{ maxWidth: '68ch' }}>
          One row per team. Export from your entry form or spreadsheet, then drop the file below. You’ll see a preview before anything is saved.
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
