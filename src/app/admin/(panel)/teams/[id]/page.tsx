import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import type { Division, Team } from '@/lib/types'
import { TeamForm } from '../team-form'

export const metadata = { title: 'Edit team' }

export default async function EditTeam({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireStaff()
  const [{ data: divisions }, { data: team }] = await Promise.all([
    supabase.from('divisions').select('*').order('sort_order').returns<Division[]>(),
    supabase.from('teams').select('*, athletes(*)').eq('id', id).maybeSingle<Team>(),
  ])
  if (!team) notFound()
  return (
    <>
      <div className="stack-sm"><span className="eyebrow">Teams</span><h1>{team.name}</h1></div>
      <TeamForm divisions={divisions ?? []} team={team} />
    </>
  )
}
