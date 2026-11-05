import { requireStaff } from '@/lib/auth'
import { withDefaults, type LivePromo } from '@/lib/live-promo'
import { PromoEditor } from './promo-editor'

export const metadata = { title: 'Big screen' }
export const dynamic = 'force-dynamic'

export default async function BigScreenPage() {
  const { supabase } = await requireStaff()
  const { data } = await supabase.from('wl_competition_settings').select('live_promo').single()
  return (
    <>
      <div className="spread">
        <div className="stack-sm">
          <span className="eyebrow">On the day</span>
          <h1>Big screen</h1>
          <p className="small muted" style={{ maxWidth: '70ch' }}>
            What runs along the bottom of the TV: the DJ, the rotating info slides (vendors, food, reminders) and the sponsor ticker.
            Changes show on the screen within a minute, no refresh needed.
          </p>
        </div>
        <div className="row">
          <a href="/live" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Open the TV screen ↗</a>
          <a href="/admin/heats" className="btn btn-ghost btn-sm">Pick the heat shown</a>
        </div>
      </div>
      <PromoEditor initial={withDefaults(data?.live_promo as Partial<LivePromo>)} />
    </>
  )
}
