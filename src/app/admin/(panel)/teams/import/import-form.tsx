'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { parseCsv, rowsToTeams, type ImportRow } from '@/lib/csv'
import { importTeams } from '../actions'

// .xlsx is read in the browser (read-excel-file); anything else is treated as CSV.
async function readRows(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/universal')
    const data = await readSheet(file)
    return data.map((row) => row.map((cell) => (cell == null ? '' : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell))))
  }
  return parseCsv(await file.text())
}

export function ImportForm() {
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState<'skip' | 'update'>('skip')
  const [result, setResult] = useState<Awaited<ReturnType<typeof importTeams>> | null>(null)
  const [pending, start] = useTransition()

  const [readError, setReadError] = useState('')

  async function onFile(file: File | undefined) {
    if (!file) return
    setResult(null)
    setReadError('')
    setFileName(file.name)
    try {
      setRows(rowsToTeams(await readRows(file)))
    } catch {
      setRows(null)
      setReadError('That file couldn’t be read. Save it as .xlsx or .csv and try again.')
    }
  }

  const valid = rows?.filter((r) => !r.error) ?? []
  const warned = valid.filter((r) => r.warnings.length)
  const invalid = rows?.filter((r) => r.error) ?? []

  return (
    <div className="stack">
      <label
        className="empty"
        style={{ cursor: 'pointer', display: 'block' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
      >
        <input id="csv-file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {fileName ? <>Loaded <b style={{ color: 'var(--text)' }}>{fileName}</b>. Choose another file to replace it.</> : 'Drop an Excel (.xlsx) or CSV file here, or click to choose one'}
      </label>

      {readError && <p className="notice notice-bad">{readError}</p>}

      {rows && (
        <div className="card stack">
          <div className="spread" style={{ alignItems: 'center' }}>
            <h2>
              {valid.length} teams · {valid.reduce((n, r) => n + r.athletes.length, 0)} athletes
              {warned.length > 0 && <span className="small" style={{ color: 'var(--warn)' }}> · {warned.length} to check</span>}
              {invalid.length > 0 && <span className="small" style={{ color: 'var(--bad)' }}> · {invalid.length} can’t import</span>}
            </h2>
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
              <thead><tr><th>Rows</th><th>Team</th><th>Division</th><th>Athletes</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td className="mono subtle">{r.lines}</td>
                    <td>{r.team_name || '—'}</td>
                    <td>{r.division || '—'}</td>
                    <td className="small">{r.athletes.map((a) => `${a.first_name} ${a.last_name}`.trim()).join(' & ')}</td>
                    <td>
                      {r.error ? <span className="pill pill-bad">{r.error}</span>
                        : r.warnings.length ? <div className="stack-sm" style={{ gap: 4 }}>{r.warnings.map((w) => <span key={w} className="pill pill-warn" style={{ whiteSpace: 'normal' }}>{w}</span>)}</div>
                        : <span className="pill pill-ok">OK</span>}
                    </td>
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
