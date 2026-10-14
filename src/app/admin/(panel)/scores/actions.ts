'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { computeScore, entriesFromAdmin, parseRoundInput, type AdminInput, type Sex } from '@/lib/scoring'
import { resolvePart, type WorkoutPart } from '@/lib/types'

type Result = { ok?: boolean; error?: string }

function refresh() {
  revalidatePath('/admin/scores')
  revalidatePath('/admin/leaderboard')
  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/tv')
  revalidatePath('/teams', 'layout')
}

export async function setStatus(scoreIds: string[], status: 'verified' | 'submitted' | 'rejected', reason?: string): Promise<Result> {
  const { supabase, actor } = await requireStaff()
  if (!scoreIds.length) return { ok: true }
  if (status === 'rejected' && !reason?.trim()) return { error: 'Give a reason for rejecting the score.' }
  const { data: before } = await supabase.from('wl_scores').select('id, status, value, part_id, team_id').in('id', scoreIds)
  if (before?.some((s) => s.status === 'appeal') && status === 'verified') {
    return { error: 'This score has an open appeal. Resolve the appeal instead.' }
  }
  const { error } = await supabase.from('wl_scores').update({
    status,
    verified_at: status === 'verified' ? new Date().toISOString() : null,
    verified_by: status === 'verified' ? actor : null,
    updated_at: new Date().toISOString(),
  }).in('id', scoreIds)
  if (error) return { error: error.message }
  await audit(supabase, { actor, action: `score.${status}`, entity: 'score', entity_id: scoreIds.join(','), before, reason })
  refresh()
  return { ok: true }
}

export async function saveAdminScore(args: {
  partId: string; teamId: string; input: AdminInput; tiebreak: string; reason: string; source: 'admin' | 'paper'
}): Promise<Result> {
  const { supabase, actor } = await requireStaff()
  if (!args.reason.trim()) return { error: args.source === 'paper' ? 'Say where the score came from, e.g. “Paper sheet, lane 3”.' : 'Give a reason for the change.' }

  const [{ data: part }, { data: team }, { data: existing }] = await Promise.all([
    supabase.from('wl_workout_parts').select('*, part_movements:wl_part_movements(*)').eq('id', args.partId).single(),
    supabase.from('wl_teams').select('id, name, division:wl_divisions(sex, level)').eq('id', args.teamId).single(),
    supabase.from('wl_scores').select('*').eq('part_id', args.partId).eq('team_id', args.teamId).maybeSingle(),
  ])
  if (!part || !team) return { error: 'Workout part or team not found.' }
  if (existing?.status === 'appeal') return { error: 'This score has an open appeal. Edit it from the appeal so the outcome is recorded.' }

  const div = team.division as unknown as { sex: Sex; level: string } | null
  const sex = (div?.sex ?? 'male') as Sex
  const teamPart = resolvePart(part as WorkoutPart, div?.level ?? 'rx') // Scaled teams use the Scaled reps
  const built = entriesFromAdmin(teamPart, sex, args.input)
  if ('error' in built) return { error: built.error }
  const result = computeScore(teamPart, sex, built.entries)

  let tiebreak: number | null = null
  if (args.tiebreak.trim()) {
    const p = parseRoundInput(args.tiebreak)
    tiebreak = p && 'time' in p ? p.time : Number(args.tiebreak)
    if (!Number.isFinite(tiebreak)) return { error: 'The tiebreak should be a time (2:41.5) or a number.' }
  }

  const now = new Date().toISOString()
  const row = {
    part_id: args.partId, team_id: args.teamId, status: 'verified', source: existing ? (existing.source === 'paper' || args.source === 'paper' ? 'paper' : 'admin') : args.source,
    capped: result.capped, value: result.value,
    reps: built.entries.kind === 'amrap' || built.entries.kind === 'max_reps' ? built.entries.reps : null,
    rounds: built.entries.kind === 'amrap' ? built.entries.rounds : null,
    tiebreak_value: tiebreak, entries: built.entries, verified_at: now, verified_by: actor, updated_at: now,
    submitted_at: existing?.submitted_at ?? now,
  }
  const { error } = await supabase.from('wl_scores').upsert(row, { onConflict: 'part_id,team_id' })
  if (error) return { error: error.message }
  await audit(supabase, {
    actor, action: existing ? 'score.edit' : `score.${args.source}`, entity: 'score', entity_id: `${args.partId}:${args.teamId}`,
    before: existing ? { status: existing.status, value: existing.value, entries: existing.entries, source: existing.source } : null,
    after: { value: result.value, display: result.display, input: args.input, tiebreak }, reason: args.reason,
  })
  refresh()
  return { ok: true }
}

export async function logAppeal(scoreId: string, description: string): Promise<Result> {
  const { supabase, actor } = await requireStaff()
  if (!description.trim()) return { error: 'Describe the appeal.' }
  const { error } = await supabase.from('wl_appeals').insert({ score_id: scoreId, description: description.trim() })
  if (error) return { error: error.message }
  await supabase.from('wl_scores').update({ status: 'appeal', updated_at: new Date().toISOString() }).eq('id', scoreId)
  await audit(supabase, { actor, action: 'appeal.open', entity: 'score', entity_id: scoreId, reason: description })
  refresh()
  return { ok: true }
}

/** Upheld: the admin's corrected score (if given) replaces the old one. Dismissed: the score stands. */
export async function resolveAppeal(args: {
  appealId: string; outcome: 'upheld' | 'rejected'; resolution: string
  correction?: { partId: string; teamId: string; input: AdminInput; tiebreak: string }
}): Promise<Result> {
  const { supabase, actor } = await requireStaff()
  if (!args.resolution.trim()) return { error: 'Write a short note on the decision.' }
  const { data: appeal } = await supabase.from('wl_appeals').select('*').eq('id', args.appealId).single()
  if (!appeal || appeal.status !== 'open') return { error: 'This appeal is already closed.' }

  if (args.correction) {
    // temporarily lift the appeal status so the edit goes through, then record it
    await supabase.from('wl_scores').update({ status: 'submitted' }).eq('id', appeal.score_id)
    const res = await saveAdminScore({ ...args.correction, reason: `Appeal upheld: ${args.resolution}`, source: 'admin' })
    if (res.error) {
      await supabase.from('wl_scores').update({ status: 'appeal' }).eq('id', appeal.score_id)
      return res
    }
  } else {
    await supabase.from('wl_scores').update({ status: 'verified', verified_at: new Date().toISOString(), verified_by: actor }).eq('id', appeal.score_id)
  }
  await supabase.from('wl_appeals').update({ status: args.outcome, resolution: args.resolution.trim(), resolved_at: new Date().toISOString() }).eq('id', args.appealId)
  await audit(supabase, { actor, action: `appeal.${args.outcome}`, entity: 'score', entity_id: appeal.score_id, reason: args.resolution })
  refresh()
  return { ok: true }
}

export async function setRelease(partIds: string[], divisionId: string, release: boolean): Promise<Result> {
  const { supabase, actor } = await requireStaff()
  if (release) {
    const { data: teams } = await supabase.from('wl_teams').select('id').eq('division_id', divisionId)
    const teamIds = (teams ?? []).map((t) => t.id)
    if (teamIds.length) {
      const { data: blocking } = await supabase.from('wl_scores').select('status').in('part_id', partIds).in('team_id', teamIds).in('status', ['draft', 'submitted', 'appeal'])
      const appeals = blocking?.filter((s) => s.status === 'appeal').length ?? 0
      const unchecked = (blocking?.length ?? 0) - appeals
      if (appeals) return { error: `${appeals} open appeal${appeals > 1 ? 's' : ''}. Resolve ${appeals > 1 ? 'them' : 'it'} before releasing.` }
      if (unchecked) return { error: `${unchecked} score${unchecked > 1 ? 's are' : ' is'} still being scored or waiting to be verified.` }
    }
    const { error } = await supabase.from('wl_releases').upsert(partIds.map((p) => ({ part_id: p, division_id: divisionId, released_by: actor })))
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('wl_releases').delete().in('part_id', partIds).eq('division_id', divisionId)
    if (error) return { error: error.message }
  }
  await audit(supabase, { actor, action: release ? 'results.release' : 'results.unrelease', entity: 'division', entity_id: divisionId, after: { parts: partIds } })
  refresh()
  return { ok: true }
}
