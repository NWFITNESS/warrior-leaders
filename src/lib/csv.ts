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
  lines: string          // spreadsheet rows this team came from, e.g. "2–3"
  team_name: string
  division: string
  bib: number | null
  notes: string | null
  athletes: ImportAthlete[]
  error?: string
  warnings: string[]
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const tidy = (v: string) => v.replace(/\s+/g, ' ').trim()
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
// Common domain slips that still look like valid addresses (hotmail.couk, hotmail.do.uk, gmail.con…)
const EMAIL_TYPO = /\.(couk|do\.uk|co\.ik|con|cmo|comm|co)$|@(gmial|gmai|hotmial|hotmal|outlok)\./i

/**
 * Turns spreadsheet rows into teams. Two layouts are understood:
 *  - one row per team: team_name, division, athlete1_first_name … (our template)
 *  - one row per athlete: First Name, Last Name, E-mail, Division, Team Name (e.g. an entry-platform export);
 *    athletes are grouped into teams by team name + division.
 */
export function rowsToTeams(rows: string[][]): ImportRow[] {
  if (rows.length < 2) return []
  const headers = rows[0].map(norm)
  const col = (...names: string[]) => names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1
  const get = (r: string[], i: number) => (i >= 0 ? tidy(String(r[i] ?? '')) : '')

  const cTeam = col('team_name', 'team')
  const cDiv = col('division', 'category')
  const cBib = col('bib', 'number', 'team_number')
  const cNotes = col('notes')

  const perAthlete = col('first_name', 'firstname') >= 0 && col('athlete1_first_name', 'athlete_1_first_name', 'athlete1_name', 'athlete_1_name') < 0
  const result = perAthlete ? groupAthleteRows(rows, col, get, cTeam, cDiv, cBib) : teamRows(rows, col, get, cTeam, cDiv, cBib, cNotes)
  return result.map(check)
}

type Col = (...names: string[]) => number
type Get = (r: string[], i: number) => string

function teamRows(rows: string[][], col: Col, get: Get, cTeam: number, cDiv: number, cBib: number, cNotes: number): ImportRow[] {
  const athleteCols = [1, 2, 3, 4].map((n) => ({
    first: col(`athlete${n}_first_name`, `athlete_${n}_first_name`, `athlete${n}_first`),
    last: col(`athlete${n}_last_name`, `athlete_${n}_last_name`, `athlete${n}_last`),
    full: col(`athlete${n}_name`, `athlete_${n}_name`, `athlete${n}`),
    email: col(`athlete${n}_email`, `athlete_${n}_email`),
    phone: col(`athlete${n}_phone`, `athlete_${n}_phone`, `athlete${n}_mobile`),
  }))

  return rows.slice(1).map((r, idx) => {
    const athletes: ImportAthlete[] = []
    for (const a of athleteCols) {
      let first = get(r, a.first)
      let last = get(r, a.last)
      const full = get(r, a.full)
      if (!first && full) {
        const [f, ...rest] = full.split(' ')
        first = f
        last = rest.join(' ')
      }
      if (!first) continue
      athletes.push({ first_name: first, last_name: last, email: get(r, a.email) || null, phone: get(r, a.phone) || null })
    }
    const bibText = get(r, cBib)
    return {
      line: idx + 2,
      lines: String(idx + 2),
      team_name: get(r, cTeam),
      division: get(r, cDiv),
      bib: bibText && Number.isFinite(Number(bibText)) ? Number(bibText) : null,
      notes: get(r, cNotes) || null,
      athletes,
      warnings: [],
    }
  })
}

function groupAthleteRows(rows: string[][], col: Col, get: Get, cTeam: number, cDiv: number, cBib: number): ImportRow[] {
  const cFirst = col('first_name', 'firstname')
  const cLast = col('last_name', 'lastname', 'surname')
  const cEmail = col('e_mail', 'email', 'email_address')
  const cPhone = col('phone', 'mobile', 'phone_number')
  const teams = new Map<string, ImportRow>()

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2
    const team = get(r, cTeam)
    const division = get(r, cDiv)
    const key = `${division.toLowerCase()}|${team.toLowerCase()}`
    let t = teams.get(key)
    if (!t) {
      const bibText = get(r, cBib)
      t = {
        line, lines: String(line), team_name: team, division,
        bib: bibText && Number.isFinite(Number(bibText)) ? Number(bibText) : null,
        notes: null, athletes: [], warnings: [],
      }
      teams.set(key, t)
    } else {
      t.lines = `${t.line}–${line}`
    }
    const first = get(r, cFirst)
    if (first) t.athletes.push({ first_name: first, last_name: get(r, cLast), email: get(r, cEmail) || null, phone: get(r, cPhone) || null })
  })
  return [...teams.values()]
}

function check(row: ImportRow): ImportRow {
  if (!row.team_name) row.error = 'Missing team name'
  else if (!row.division) row.error = 'Missing division'
  else if (row.athletes.length === 0) row.error = 'No athletes'

  const names = row.athletes.map((a) => `${a.first_name} ${a.last_name}`.toLowerCase())
  if (new Set(names).size < names.length) row.warnings.push('Same athlete name twice')
  for (const a of row.athletes) {
    if (a.email && (!EMAIL.test(a.email) || EMAIL_TYPO.test(a.email))) row.warnings.push(`Email looks wrong: ${a.email}`)
  }
  if (row.athletes.length && row.athletes.length !== 2) row.warnings.push(`${row.athletes.length} athletes (pairs expected)`)
  return row
}
