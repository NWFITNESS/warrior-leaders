// Minimal CSV parser (RFC 4180: quoted fields, escaped quotes, CRLF) — no dependency needed.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

export const TEMPLATE_HEADERS = [
  'team_name', 'division',
  'athlete1_first_name', 'athlete1_last_name', 'athlete1_email', 'athlete1_phone',
  'athlete2_first_name', 'athlete2_last_name', 'athlete2_email', 'athlete2_phone',
  'bib', 'notes',
]

export const TEMPLATE_CSV =
  TEMPLATE_HEADERS.join(',') + '\n' +
  'Barbell Bandits,RX Male,Tom,Hale,tom@example.com,07700 900001,Ryan,Ashby,ryan@example.com,07700 900002,1,\n' +
  'Deadlift Divas,Scaled Female,Jess,Cole,jess@example.com,,Kim,Shaw,kim@example.com,,2,\n'

export interface ImportAthlete { first_name: string; last_name: string; email: string | null; phone: string | null }
export interface ImportRow {
  line: number
  team_name: string
  division: string
  bib: number | null
  notes: string | null
  athletes: ImportAthlete[]
  error?: string
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Accepts the template headers plus common variations (e.g. "Team Name", "Athlete 1 Name").
export function rowsToTeams(rows: string[][]): ImportRow[] {
  if (rows.length < 2) return []
  const headers = rows[0].map(norm)
  const col = (...names: string[]) => names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1

  const cTeam = col('team_name', 'team')
  const cDiv = col('division', 'category')
  const cBib = col('bib', 'number')
  const cNotes = col('notes')

  const athleteCols = [1, 2, 3, 4].map((n) => ({
    first: col(`athlete${n}_first_name`, `athlete_${n}_first_name`, `athlete${n}_first`),
    last: col(`athlete${n}_last_name`, `athlete_${n}_last_name`, `athlete${n}_last`),
    full: col(`athlete${n}_name`, `athlete_${n}_name`, `athlete${n}`),
    email: col(`athlete${n}_email`, `athlete_${n}_email`),
    phone: col(`athlete${n}_phone`, `athlete_${n}_phone`, `athlete${n}_mobile`),
  }))

  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

  return rows.slice(1).map((r, idx) => {
    const athletes: ImportAthlete[] = []
    for (const a of athleteCols) {
      let first = get(r, a.first)
      let last = get(r, a.last)
      const full = get(r, a.full)
      if (!first && full) {
        const [f, ...rest] = full.split(/\s+/)
        first = f
        last = rest.join(' ')
      }
      if (!first) continue
      athletes.push({ first_name: first, last_name: last, email: get(r, a.email) || null, phone: get(r, a.phone) || null })
    }
    const bibText = get(r, cBib)
    const row: ImportRow = {
      line: idx + 2,
      team_name: get(r, cTeam),
      division: get(r, cDiv),
      bib: bibText && Number.isFinite(Number(bibText)) ? Number(bibText) : null,
      notes: get(r, cNotes) || null,
      athletes,
    }
    if (!row.team_name) row.error = 'Missing team name'
    else if (!row.division) row.error = 'Missing division'
    else if (athletes.length === 0) row.error = 'No athletes'
    return row
  })
}
