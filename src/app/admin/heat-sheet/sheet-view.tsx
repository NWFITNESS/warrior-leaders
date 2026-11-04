import { Logo } from '@/components/Logo'
import { PrintButton } from './print-button'

const short = (d: { level: string; sex: string }) => `${d.level === 'scaled' ? 'SC' : 'RX'} ${d.sex === 'female' ? 'F' : d.sex === 'male' ? 'M' : 'X'}`

export interface SheetEvent {
  id: string; number: number; name: string; open_entry: boolean; len: number; window: string | null; opens: string | null
  heats: { id: string; number: number; start: string | null; divs: { id: string; level: string; sex: string }[] }[]
}

export function HeatSheetView({ date, venue, events }: { date: string; venue: string; events: SheetEvent[] }) {
  return (
    <main className="hsheet">
      <div className="hs-tools">
        <a href="/admin/heats">‹ Heats &amp; lanes</a>
        <PrintButton />
      </div>

      <article className="hs-page">
        <header className="hs-head">
          <Logo width={230} />
          <div className="hs-title">
            <h1>Heat times</h1>
            <p>{date}{venue ? ` · ${venue}` : ''}</p>
          </div>
        </header>

        <div className="hs-grid">
          {events.map((e) => (
            <section key={e.id} className={`hs-ev${e.open_entry ? ' side' : ''}`}>
              <div className="hs-ev-head">
                <span className="hs-n">{e.number}</span>
                <div>
                  <h2>{e.name}</h2>
                  <p>
                    {e.open_entry ? 'Side event · any time' : e.window ?? (e.number === Math.max(...events.map((x) => x.number)) ? 'The final' : 'Times to be confirmed')}
                    {!e.open_entry && e.len ? ` · ${e.len} min` : ''}
                  </p>
                </div>
              </div>

              {e.open_entry ? (
                <div className="hs-note">
                  <b>Open{e.opens ? ` from ${e.opens}` : ''}</b>
                  <span>Go when you’re ready: a judge will score you at the station.</span>
                </div>
              ) : e.heats.length === 0 ? (
                <div className="hs-note">
                  <b>{e.opens ? `From ${e.opens}` : 'Heats coming soon'}</b>
                  <span>{e.number === Math.max(...events.map((x) => x.number)) ? 'Final: top teams in each division. Heats announced after the qualifying events.' : 'Heat times will be added here.'}</span>
                </div>
              ) : (
                <ol className="hs-heats">
                  {e.heats.map((h) => (
                    <li key={h.id}>
                      <span className="t">{h.start ?? 'TBC'}</span>
                      <span className="h">Heat {h.number}</span>
                      <span className="d">
                        {h.divs.map((d) => <i key={d.id} className={d.level === 'scaled' ? 'sc' : 'rx'}>{short(d)}</i>)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>

        <footer className="hs-foot">
          <span>Be in the warm-up area 15 minutes before your heat.</span>
          <span>Your lane: leaders.northernwarrior.co.uk</span>
        </footer>
      </article>
    </main>
  )
}
