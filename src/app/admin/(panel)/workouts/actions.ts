'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import type { Workout, WorkoutPart } from '@/lib/types'

export async function createWorkout() {
  const { supabase, actor } = await requireStaff()
  const { data: last } = await supabase.from('wl_workouts').select('number').order('number', { ascending: false }).limit(1).maybeSingle()
  const number = (last?.number ?? 0) + 1
  const { data, error } = await supabase.from('wl_workouts').insert({ number, name: `Event ${number}` }).select('id').single()
  if (error) throw new Error(error.message)
  await supabase.from('wl_workout_parts').insert({ workout_id: data.id, label: '', sort_order: 0 })
  await audit(supabase, { actor, action: 'workout.create', entity: 'workout', entity_id: data.id })
  redirect(`/admin/workouts/${data.id}`)
}

export interface WorkoutInput {
  id: string
  number: number
  name: string
  description: string | null
  combine_parts: boolean
  status: Workout['status']
  parts: (WorkoutPart & { id: string })[]
}

export async function saveWorkout(input: WorkoutInput): Promise<{ error?: string; ok?: boolean }> {
  const { supabase, actor } = await requireStaff()
  if (!input.name.trim()) return { error: 'Give the workout a name.' }
  if (input.parts.length === 0) return { error: 'A workout needs at least one part.' }

  const { data: before } = await supabase.from('wl_workouts').select('*, workout_parts:wl_workout_parts(*, part_movements:wl_part_movements(*))').eq('id', input.id).single()

  const { error: wErr } = await supabase.from('wl_workouts').update({
    number: input.number,
    name: input.name.trim(),
    description: input.description || null,
    combine_parts: input.combine_parts,
    status: input.status,
    updated_at: new Date().toISOString(),
  }).eq('id', input.id)
  if (wErr) return { error: wErr.message }

  // Parts: upsert by id (ids are created in the browser so scores keep pointing at the same part),
  // then remove parts that were deleted in the builder.
  const partIds = input.parts.map((p) => p.id)
  const { data: scoredParts } = await supabase.from('wl_scores').select('part_id').eq('status', 'verified').in('part_id', (before?.workout_parts ?? []).map((p: { id: string }) => p.id))
  const removed = (before?.workout_parts ?? []).filter((p: { id: string }) => !partIds.includes(p.id))
  if (removed.some((p: { id: string }) => scoredParts?.some((s) => s.part_id === p.id))) {
    return { error: 'A part you removed already has verified scores. Keep the part, or delete its scores first.' }
  }
  if (removed.length) await supabase.from('wl_workout_parts').delete().in('id', removed.map((p: { id: string }) => p.id))

  const { error: pErr } = await supabase.from('wl_workout_parts').upsert(
    input.parts.map((p, i) => ({
      id: p.id,
      workout_id: input.id,
      label: p.label.trim(), // blank = no letter shown anywhere
      name: p.name.trim(),
      sort_order: i,
      score_type: p.score_type,
      direction: p.direction,
      time_cap_seconds: p.time_cap_seconds,
      rounds: p.score_type === 'for_time' ? Math.max(1, Math.min(20, p.rounds || 1)) : 1,
      capped_round_rule: p.capped_round_rule,
      total_reps: p.total_reps,
      unit: p.unit || null,
      load_entry: p.load_entry,
      scored: p.scored,
      tiebreak_note: p.tiebreak_note || null,
      notes: p.notes || null,
    }))
  )
  if (pErr) return { error: pErr.message }

  // Movements: same approach.
  const allMovements = input.parts.flatMap((p) =>
    p.part_movements
      .filter((m) => m.name.trim())
      .map((m, i) => ({
        id: m.id!,
        part_id: p.id,
        sort_order: i,
        name: m.name.trim(),
        reps: m.reps,
        reps_female: m.reps_female,
        rx_load: m.rx_load || null,
        scaled_load: m.scaled_load || null,
        standards: m.standards || null,
        scaled_name: m.scaled_name?.trim() || null,
        scaled_reps: m.scaled_reps ?? null,
        scaled_reps_female: m.scaled_reps_female ?? null,
        scaled_standards: m.scaled_standards?.trim() || null,
      }))
  )
  const { error: dErr } = await supabase.from('wl_part_movements').delete().in('part_id', partIds).not('id', 'in', `(${allMovements.map((m) => m.id).join(',') || '00000000-0000-0000-0000-000000000000'})`)
  if (dErr) return { error: dErr.message }
  if (allMovements.length) {
    const { error: mErr } = await supabase.from('wl_part_movements').upsert(allMovements)
    if (mErr) return { error: mErr.message }
  }

  await audit(supabase, { actor, action: 'workout.update', entity: 'workout', entity_id: input.id, before, after: input })
  revalidatePath('/admin/workouts')
  revalidatePath(`/admin/workouts/${input.id}`)
  return { ok: true }
}

export async function deleteWorkout(id: string) {
  const { supabase, actor } = await requireStaff()
  const { data: parts } = await supabase.from('wl_workout_parts').select('id').eq('workout_id', id)
  const partIds = (parts ?? []).map((p) => p.id)
  const { count } = partIds.length
    ? await supabase.from('wl_scores').select('id', { count: 'exact', head: true }).in('part_id', partIds)
    : { count: 0 }
  if (count) throw new Error('This workout already has scores and can’t be deleted.')
  const { data: before } = await supabase.from('wl_workouts').select('*, workout_parts:wl_workout_parts(*, part_movements:wl_part_movements(*))').eq('id', id).single()
  await supabase.from('wl_workouts').delete().eq('id', id)
  await audit(supabase, { actor, action: 'workout.delete', entity: 'workout', entity_id: id, before })
  revalidatePath('/admin/workouts')
  redirect('/admin/workouts')
}

export async function duplicateWorkout(id: string) {
  const { supabase, actor } = await requireStaff()
  const { data: src } = await supabase.from('wl_workouts').select('*, workout_parts:wl_workout_parts(*, part_movements:wl_part_movements(*))').eq('id', id).single()
  if (!src) throw new Error('Workout not found')
  const { data: last } = await supabase.from('wl_workouts').select('number').order('number', { ascending: false }).limit(1).single()
  const { data: copy } = await supabase.from('wl_workouts')
    .insert({ number: (last?.number ?? 0) + 1, name: `${src.name} (copy)`, description: src.description, combine_parts: src.combine_parts })
    .select('id').single()
  for (const p of src.workout_parts as (WorkoutPart & { id: string; workout_id: string })[]) {
    const { id: _pid, workout_id: _wid, part_movements, ...rest } = p
    const { data: np } = await supabase.from('wl_workout_parts').insert({ ...rest, workout_id: copy!.id }).select('id').single()
    if (part_movements.length) {
      await supabase.from('wl_part_movements').insert(
        part_movements.map(({ id: _mid, ...m }) => ({ ...m, part_id: np!.id }))
      )
    }
  }
  await audit(supabase, { actor, action: 'workout.duplicate', entity: 'workout', entity_id: copy!.id, after: { from: id } })
  redirect(`/admin/workouts/${copy!.id}`)
}
