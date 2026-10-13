'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { parseCsv, rowsToTeams, type ImportRow } from '@/lib/csv'
import { importTeams } from '../actions'

export function ImportForm() {
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState<'skip' | 'update'>('skip')
  const [result, setResult] = useState<Awaited<ReturnType<typeof importTeams>> | null>(null)
  const [pending, start] = useTransition()

  async function onFile(file: File | undefined) {
    if (!file) return
    setResult(null)
    setFileName(file.name)
    setRows(rowsToTeams(parseCsv(await file.text())))
  }

  const valid = rows?.filter((r) => !r.error) ?? []
  const invalid = rows?.filter((r) => r.error) ?? []

  return (
    <div className="stack">
      <label
        className="empty"
        style={{ cursor: 'pointer', display: 'block' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
      >
        <input id="csv-file" type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {fileName ? <>Loaded <b style={{ color: 'var(--text)' }}>{fileName}</b>. Choose another file to replace it.</> : 'Drop a CSV here, or click to choose a file'}
      </label>

      {rows && (
        <div className="card stack">
          <div className="spread" style={{ alignItems: 'center' }}>
            <h2>{valid.length} teams ready{invalid.length > 0 && <span className="small" style={{ color: 'var(--bad)' }}> · {invalid.length} rows with problems</span>}</h2>
            <div className="row">
              <span className="small subtle">If a team already exists:</span>
              <div className="seg">
                <button type="button" aria-pressed={mode === 'skip'} onClick={() => setMode('skip')}>Skip it</button>
                <button type="button" aria-pressed={mode === 'update'} onClick={() => setMode('update')}>Replace its athletes</button>
              </div>
            </div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>Line</th><th>Team</th><th>Division</th><th>Athletes</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="mono subtle">{r.line}</td>
                    <td>{r.team_name || '—'}</td>
                    <td>{r.division || '—'}</td>
                    <td className="small">{r.athletes.map((a) => `${a.first_name} ${a.last_name}`.trim()).join(' & ')}</td>
                    <td>{r.error ? <span className="pill pill-bad">{r.error}</span> : <span className="pill pill-ok">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result && (
            <div className="row">
              <button className="btn" disabled={pending || valid.length === 0} onClick={() => start(async () => setResult(await importTeams(rows, mode)))}>
                {pending ? 'Importing…' : `Import ${valid.length} teams`}
              </button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className={`notice ${result.errors.length ? '' : 'notice-ok'}`}>
          <p>Created {result.created}, updated {result.updated}, skipped {result.skipped}.</p>
          {result.errors.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--bad)' }}>
              {result.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <p style={{ marginTop: 8 }}><Link href="/admin/teams">Back to teams</Link></p>
        </div>
      )}
    </div>
  )
}
