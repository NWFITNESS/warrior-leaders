/**
 * An event's dates, UK time.
 *   short: "Sat 7 Nov 2026" · "Sat 6 – Sun 7 Jun 2027"
 *   long:  "Saturday 7 November 2026" · "Saturday 6 – Sunday 7 June 2027"
 */
export function eventDates(start: string | null, end: string | null, long = false) {
  if (!start) return ''
  const wd = long ? 'long' : 'short'
  const mo = long ? 'long' : 'short'
  const d = (s: string, o: Intl.DateTimeFormatOptions) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Europe/London', ...o })
  if (!end || end === start) return d(start, { weekday: wd, day: 'numeric', month: mo, year: 'numeric' })
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${d(start, { weekday: wd, day: 'numeric', ...(sameMonth ? {} : { month: mo }), ...(sameYear ? {} : { year: 'numeric' }) })} – ${d(end, { weekday: wd, day: 'numeric', month: mo, year: 'numeric' })}`
}
