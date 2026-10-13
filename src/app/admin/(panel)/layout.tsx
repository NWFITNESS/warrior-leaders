import { requireStaff } from '@/lib/auth'
import { signOut } from '../login/actions'
import { AdminNav } from './nav'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { actor } = await requireStaff()

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">The Warrior<br />Leaders</div>
        <AdminNav />
        <div className="admin-foot">
          <span>{actor}</span>
          <form action={signOut}><button className="linkbtn">Sign out</button></form>
          <a href="/" target="_blank" rel="noreferrer">View public site ↗</a>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  )
}
