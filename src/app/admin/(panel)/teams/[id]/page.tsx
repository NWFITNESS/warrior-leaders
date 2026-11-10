import { notFound } from 'next/navigation'
import { requireEvent } from '@/lib/event'
import type { Division, Team } from '@/lib/types'
import { TeamForm } from '../team-form'

export const metadata = { title: 'Edit team' }

export default async function EditTeam({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, event } = await requireEvent()
  const [{ data: divisions }, { data: team }] = await Promise.all([
    supabase.from('wl_divisions').select('*').eq('competition_id', event.id).order('sort_order').returns<Division[]>(),
    supabase.from('wl_teams').select('*, athletes:wl_athletes(*)').eq('competition_id', event.id).eq('id', id).maybeSingle<Team>(),
  ])
  if (!team) notFound()
  return (
    <>
      <div className="stack-sm"><span className="eyebrow">Teams</span><h1>{team.name}</h1></div>
      <TeamForm divisions={divisions ?? []} team={team} />
    </>
  )
}
