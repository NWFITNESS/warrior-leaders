'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'

export async function saveJudge(formData: FormData) {
  const { supabase, actor } = await requireStaff()
  const id = String(formData.get('id') ?? '')
  const row = {
    name: String(formData.get('name') ?? '').trim(),
    role: formData.get('role') === 'head' ? 'head' : 'lane',
    phone: String(formData.get('phone') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    active: formData.get('active') !== 'off',
  }
  if (!row.name) return
  if (id) await supabase.from('wl_judges').update(row).eq('id', id)
  else await supabase.from('wl_judges').insert(row)
  await audit(supabase, { actor, action: id ? 'judge.update' : 'judge.create', entity: 'judge', entity_id: id || undefined, after: row })
  revalidatePath('/admin/judges')
}

export async function toggleJudge(id: string, active: boolean) {
  const { supabase, actor } = await requireStaff()
  await supabase.from('wl_judges').update({ active }).eq('id', id)
  await audit(supabase, { actor, action: active ? 'judge.activate' : 'judge.deactivate', entity: 'judge', entity_id: id })
  revalidatePath('/admin/judges')
}

export async function deleteJudge(id: string) {
  const { supabase, actor } = await requireStaff()
  await supabase.from('wl_judges').delete().eq('id', id)
  await audit(supabase, { actor, action: 'judge.delete', entity: 'judge', entity_id: id })
  revalidatePath('/admin/judges')
}

/** Clear practice scores for one event (or all), optionally freeing the lanes judges have taken. Judges stay signed in. */
export async function resetScores(workoutId: string | null, freeLanes: boolean, confirm: string): Promise<{ ok?: string; error?: string }> {
  const { supabase, actor } = await requireStaff()
  if (confirm.trim().toUpperCase() !== 'CLEAR') return { error: 'Type CLEAR to confirm.' }
  const { data, error } = await supabase.rpc('wl_admin_reset_scores', { p_workout: workoutId, p_free_lanes: freeLanes })
  if (error) return { error: error.message }
  await audit(supabase, { actor, action: 'reset_scores', entity: 'scores', entity_id: workoutId ?? undefined, after: { ...data, free_lanes: freeLanes } })
  revalidatePath('/admin', 'layout')
  revalidatePath('/')
  return { ok: `Cleared ${data.scores} score${data.scores === 1 ? '' : 's'}${freeLanes ? ` and freed ${data.lanes} lane${data.lanes === 1 ? '' : 's'}` : ''}. Judges' phones drop their copies next time they load.` }
}
