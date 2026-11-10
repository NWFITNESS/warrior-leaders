import { eventDates, requireEvent, GYM_SLUG } from '@/lib/event'
import { signOut } from '../login/actions'
import { AdminMobileBar, AdminNav } from './nav'
import { Logo } from '@/components/Logo'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { actor, event } = await requireEvent()

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">
          <Logo width={190} />
          <span>Admin</span>
        </div>
        <a href="/admin/events" className="admin-event" title="Switch event">
          <span className="small subtle">Event</span>
          <b>{event.name}</b>
          <span className="small subtle">{eventDates(event.start_date, event.end_date)} · Switch ▾</span>
        </a>
        <AdminNav />
        <div className="admin-foot">
          <span>{actor}</span>
          <form action={signOut}><button className="linkbtn">Sign out</button></form>
          <a href={`/${GYM_SLUG}/${event.slug}`} target="_blank" rel="noreferrer">View public site ↗</a>
        </div>
      </aside>
      <AdminMobileBar>
        <a href="/admin/events"><b>{event.name}</b> · Switch event</a>
        <span>{actor}</span>
        <a href={`/${GYM_SLUG}/${event.slug}`} target="_blank" rel="noreferrer">View public site ↗</a>
        <form action={signOut}><button className="linkbtn">Sign out</button></form>
      </AdminMobileBar>
      <main className="admin-main">{children}</main>
    </div>
  )
}
