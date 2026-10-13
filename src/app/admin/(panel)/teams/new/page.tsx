import { requireStaff } from '@/lib/auth'
import type { Division } from '@/lib/types'
import { TeamForm } from '../team-form'

export const metadata = { title: 'Add team' }

export default async function NewTeam() {
  const { supabase } = await requireStaff()
  const { data: divisions } = await supabase.from('divisions').select('*').order('sort_order').returns<Division[]>()
  return (
    <>
      <div className="stack-sm"><span className="eyebrow">Teams</span><h1>Add team</h1></div>
      <TeamForm divisions={divisions ?? []} />
    </>
  )
}
