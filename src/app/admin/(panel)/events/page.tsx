import { requireEvent, eventDates, GYM_SLUG } from '@/lib/event'
import { switchEvent, makePublicEvent } from './actions'
import { NewEventForm } from './new-event-form'

export const metadata = { title: 'Events' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, string> = { draft: 'Draft', live: 'Live', finished: 'Finished', archived: 'Archived' }
const tag = (gold: boolean): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
  background: gold ? 'rgba(201,167,10,0.16)' : 'rgba(255,255,255,0.08)', color: gold ? 'var(--gold-hi)' : 'var(--muted)',
})

export default async function EventsPage() {
  const { supabase, event: current } = await requireEvent()
  const { data: gym } = await supabase.from('wl_gyms').select('id, name, current_competition_id').eq('slug', GYM_SLUG).single()
  const { data: events } = await supabase.from('wl_competitions')
    .select('id, name, slug, start_date, end_date, status, teams:wl_teams(count), workouts:wl_workouts(count)')
    .eq('gym_id', gym!.id).order('start_date', { ascending: false, nullsFirst: true })
  const list = events ?? []
  return (
    <>
      <div className="stack-sm">
        <span className="eyebrow">{gym?.name}</span>
        <h1>Events</h1>
        <p className="small muted" style={{ maxWidth: '70ch' }}>
          Every event has its own teams, workouts, judges, heats and scores. The admin works on the event you pick here.
          The <b>public event</b> is the one the website, TV and judges’ app show.
        </p>
      </div>
      <section className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Event</th><th>Dates</th><th>Status</th><th>Teams</th><th>Workouts</th><th></th></tr></thead>
            <tbody>
              {list.map((e) => {
                const isPublic = gym?.current_competition_id === e.id
                const isMine = current.id === e.id
                return (
                  <tr key={e.id}>
                    <td>
                      <b>{e.name}</b>
                      <div className="small subtle mono">/{e.slug}</div>
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        {isMine && <span style={tag(false)}>Working on</span>}
                        {isPublic && <span style={tag(true)}>Public event</span>}
                      </div>
                    </td>
                    <td className="small">{eventDates(e.start_date, e.end_date)}</td>
                    <td className="small">{STATUS[e.status] ?? e.status}</td>
                    <td className="mono">{(e.teams as { count: number }[])[0]?.count ?? 0}</td>
                    <td className="mono">{(e.workouts as { count: number }[])[0]?.count ?? 0}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {!isMine && (
                          <form action={switchEvent}><input type="hidden" name="id" value={e.id} /><button className="btn btn-sm">Work on this</button></form>
                        )}
                        {!isPublic && (
                          <form action={makePublicEvent}><input type="hidden" name="id" value={e.id} /><button className="btn btn-ghost btn-sm">Make public event</button></form>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <NewEventForm events={list.map((e) => ({ id: e.id, name: e.name }))} />
    </>
  )
}
