import { requireStaff } from '@/lib/auth'
import type { Settings } from '@/lib/types'
import { SettingsForm } from './settings-form'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const { supabase } = await requireStaff()
  const { data: settings } = await supabase.from('competition_settings').select('*').single<Settings>()
  const { data: divisions } = await supabase.from('divisions').select('name, teams(count)').order('sort_order')
  const largest = Math.max(1, ...(divisions ?? []).map((d: { teams: { count: number }[] }) => d.teams[0]?.count ?? 0))
  if (!settings) return <div className="notice notice-bad">Settings row missing. Run the database migration first.</div>
  return (
    <>
      <div className="stack-sm"><span className="eyebrow">Competition</span><h1>Settings</h1></div>
      <SettingsForm settings={settings} largestDivision={largest} />
    </>
  )
}
