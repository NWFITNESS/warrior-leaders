import { requireEvent } from '@/lib/event'
import { SettingsForm } from './settings-form'
import { DivisionsEditor } from './divisions-editor'

export const metadata = { title: 'Event settings' }

export default async function SettingsPage() {
  const { supabase, event } = await requireEvent()
  const { data: divisions } = await supabase.from('wl_divisions').select('id, name, level, sex, teams:wl_teams(count)').eq('competition_id', event.id).order('sort_order')
  const list = (divisions ?? []).map((d) => ({ id: d.id as string, name: d.name as string, level: d.level, sex: d.sex, teams: (d.teams as { count: number }[])[0]?.count ?? 0 }))
  const largest = Math.max(1, ...list.map((d) => d.teams))
  return (
    <>
      <div className="stack-sm"><span className="eyebrow">This event</span><h1>Event settings</h1></div>
      <SettingsForm key={event.id} settings={event} largestDivision={largest} />
      <DivisionsEditor key={`d-${event.id}`} initial={list} />
    </>
  )
}
