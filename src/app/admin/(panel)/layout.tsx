import { requireStaff } from '@/lib/auth'
import { signOut } from '../login/actions'
import { AdminMobileBar, AdminNav } from './nav'
import { Logo } from '@/components/Logo'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { actor } = await requireStaff()

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">
          <Logo width={190} />
          <span>Admin</span>
        </div>
        <AdminNav />
        <div className="admin-foot">
          <span>{actor}</span>
          <form action={signOut}><button className="linkbtn">Sign out</button></form>
          <a href="/" target="_blank" rel="noreferrer">View public site ↗</a>
        </div>
      </aside>
      <AdminMobileBar>
        <span>{actor}</span>
        <a href="/" target="_blank" rel="noreferrer">View public site ↗</a>
        <form action={signOut}><button className="linkbtn">Sign out</button></form>
      </AdminMobileBar>
      <main className="admin-main">{children}</main>
    </div>
  )
}
