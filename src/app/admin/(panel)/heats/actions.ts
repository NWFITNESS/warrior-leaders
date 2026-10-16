'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'

export interface HeatInput {
  id: string // created in the browser so lane assignments keep their ids across saves
  number: number
  start_time: string | null // HH:MM
  lanes: { lane: number; team_id: string | null; judge_id: string | null }[]
}

export async function saveHeats(workoutId: string, heats: HeatInput[]): Promise<{ error?: string; ok?: boolean }> {
  const { supabase, actor } = await requireStaff()

  // A team can only race once per workout.
  const seen = new Map<string, number>()
  for (const h of heats) for (const l of h.lanes) {
    if (!l.team_id) continue
    if (seen.has(l.team_id)) return { error: `A team is in heat ${seen.get(l.team_id)} and heat ${h.number}. Each team races once per workout.` }
    seen.set(l.team_id, h.number)
  }

  const { data: before } = await supabase.from('wl_heats').select('*, lanes:wl_lane_assignments(*)').eq('workout_id', workoutId)
  const keep = heats.map((h) => h.id)
  const removed = (before ?? []).filter((h) => !keep.includes(h.id)).map((h) => h.id)
  if (removed.length) await supabase.from('wl_heats').delete().in('id', removed)

  // Heat numbers are unique per workout: park existing rows on negative numbers first so renumbering can't collide.
  if (before?.length) {
    for (const h of before.filter((b) => keep.includes(b.id))) {
      await supabase.from('wl_heats').update({ number: -1 - Math.abs(h.number) - 1000 }).eq('id', h.id)
    }
  }
  const { error: hErr } = await supabase.from('wl_heats').upsert(
    heats.map((h) => ({ id: h.id, workout_id: workoutId, number: h.number, start_time: h.start_time || null }))
  )
  if (hErr) return { error: hErr.message }

  for (const h of heats) {
    const filled = h.lanes.filter((l) => l.team_id || l.judge_id)
    const lanes = filled.map((l) => l.lane)
    const del = supabase.from('wl_lane_assignments').delete().eq('heat_id', h.id)
    await (lanes.length ? del.not('lane', 'in', `(${lanes.join(',')})`) : del)
    if (filled.length) {
      const { error } = await supabase.from('wl_lane_assignments').upsert(
        filled.map((l) => ({ heat_id: h.id, lane: l.lane, team_id: l.team_id, judge_id: l.judge_id })),
        { onConflict: 'heat_id,lane' }
      )
      if (error) return { error: error.message }
    }
  }

  await audit(supabase, { actor, action: 'heats.save', entity: 'workout', entity_id: workoutId, before, after: heats })
  revalidatePath('/admin/heats')
  return { ok: true }
}

/** Pin a heat to the /live big screen ('' = follow the judges automatically). */
export async function setLiveHeat(formData: FormData) {
  const { supabase, actor } = await requireStaff()
  const heat = String(formData.get('heat') ?? '') || null
  const { error } = await supabase.from('wl_competition_settings').update({ live_heat_id: heat }).eq('id', 1)
  if (error) throw new Error(error.message)
  await audit(supabase, { actor, action: 'live.screen', entity: 'heat', entity_id: heat ?? undefined, after: { live_heat_id: heat } })
  revalidatePath('/admin/heats')
}
