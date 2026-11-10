'use server'

import { revalidatePath } from 'next/cache'
import { requireEvent } from '@/lib/event'
import { audit } from '@/lib/audit'

/** Tick an athlete in (or undo it). */
export async function setCheckIn(athleteId: string, checkedIn: boolean): Promise<{ ok?: boolean; at?: string | null; error?: string }> {
  const { supabase, actor, event } = await requireEvent()
  const at = checkedIn ? new Date().toISOString() : null
  const { error } = await supabase.from('wl_athletes').update({ checked_in_at: at, checked_in_by: checkedIn ? actor : null }).eq('id', athleteId)
  if (error) return { error: error.message }
  await audit(supabase, { competition_id: event.id, actor, action: checkedIn ? 'athlete.check_in' : 'athlete.check_in_undo', entity: 'athlete', entity_id: athleteId })
  revalidatePath('/admin/check-in')
  return { ok: true, at }
}

/** Check a whole team in (or undo it): every athlete on the team. */
export async function setTeamCheckIn(teamId: string, checkedIn: boolean): Promise<{ ok?: boolean; at?: string | null; error?: string }> {
  const { supabase, actor, event } = await requireEvent()
  const at = checkedIn ? new Date().toISOString() : null
  const { error } = await supabase.from('wl_athletes').update({ checked_in_at: at, checked_in_by: checkedIn ? actor : null }).eq('team_id', teamId)
  if (error) return { error: error.message }
  await audit(supabase, { competition_id: event.id, actor, action: checkedIn ? 'team.check_in' : 'team.check_in_undo', entity: 'team', entity_id: teamId })
  revalidatePath('/admin/check-in')
  return { ok: true, at }
}
