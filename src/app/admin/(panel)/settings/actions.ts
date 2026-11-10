'use server'

import { revalidatePath } from 'next/cache'
import { requireEvent } from '@/lib/event'
import { audit } from '@/lib/audit'
import type { PointsMethod } from '@/lib/types'

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function saveSettings(_prev: { ok?: boolean; error?: string }, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, actor, event } = await requireEvent()
  const method = String(formData.get('points_method')) as PointsMethod
  const custom = String(formData.get('custom_points') ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
  if (method === 'custom' && (custom.length === 0 || custom.some((n) => !Number.isFinite(n)))) {
    return { error: 'Custom points should be a list of numbers, e.g. 100, 95, 90.' }
  }
  const code = String(formData.get('judge_code') ?? '').trim()
  if (!/^\d{4}$/.test(code)) return { error: 'The judge code must be 4 digits.' }
  const headCode = String(formData.get('head_judge_code') ?? '').trim()
  if (!/^\d{4}$/.test(headCode)) return { error: 'The head judge code must be 4 digits.' }
  if (headCode === code) return { error: 'The head judge code must be different from the judge code.' }
  const lanes = Number(formData.get('lanes_per_heat'))
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > 30) return { error: 'Lanes per heat must be between 1 and 30.' }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Give the event a name.' }
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  if (!SLUG.test(slug)) return { error: 'The web address can only use lower-case letters, numbers and single dashes, e.g. summer-throwdown-2027.' }
  const start = String(formData.get('start_date') ?? '')
  const end = String(formData.get('end_date') ?? '') || start
  if (!DATE.test(start)) return { error: 'Pick the start date.' }
  if (!DATE.test(end) || end < start) return { error: 'The end date can’t be before the start date.' }
  const status = String(formData.get('status') ?? event.status)
  if (!['draft', 'live', 'finished', 'archived'].includes(status)) return { error: 'Unknown status.' }

  const row = {
    name,
    short_name: String(formData.get('short_name') ?? '').trim() || 'Warrior Leaders',
    slug,
    start_date: start,
    end_date: end,
    status,
    venue: String(formData.get('venue') ?? '').trim(),
    points_method: method,
    custom_points: custom,
    lanes_per_heat: lanes,
    judge_code: code,
    head_judge_code: headCode,
    overall_tiebreak: String(formData.get('overall_tiebreak') ?? '').trim(),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('wl_competitions').update(row).eq('id', event.id)
  if (error) {
    if (error.message.includes('wl_competitions_gym_id_slug_key')) return { error: 'Another event already uses that web address.' }
    if (error.message.includes('judge_code_taken')) return { error: 'Another open event (draft or live) already uses one of these judge codes. Pick different codes: each code tells the judges’ app which event they’re at.' }
    if (error.message.includes('judge_code_clash')) return { error: 'The head judge code must be different from the judge code.' }
    return { error: error.message }
  }
  const { live_promo: _p, score_resets: _r, ...before } = event
  await audit(supabase, { competition_id: event.id, actor, action: 'event.update', entity: 'event', entity_id: event.id, before, after: row })
  revalidatePath('/admin', 'layout')
  return { ok: true }
}

export interface DivisionInput { id?: string; name: string; level: 'rx' | 'scaled'; sex: 'male' | 'female' | 'mixed' }

/** Replace the event's divisions with this list (in this order). Divisions with teams can't be removed. */
export async function saveDivisions(list: DivisionInput[]): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, actor, event } = await requireEvent()
  const clean = list.map((d) => ({ ...d, name: d.name.trim() })).filter((d) => d.name)
  if (new Set(clean.map((d) => d.name.toLowerCase())).size !== clean.length) return { error: 'Two divisions have the same name.' }
  const { data: before } = await supabase.from('wl_divisions').select('id, name, level, sex, sort_order, teams:wl_teams(count)').eq('competition_id', event.id)
  const keep = new Set(clean.map((d) => d.id).filter(Boolean))
  const removed = (before ?? []).filter((d) => !keep.has(d.id))
  const busy = removed.find((d) => ((d.teams as { count: number }[])[0]?.count ?? 0) > 0)
  if (busy) return { error: `${busy.name} has teams in it. Move or delete them first.` }
  if (removed.length) {
    const { error } = await supabase.from('wl_divisions').delete().in('id', removed.map((d) => d.id)).eq('competition_id', event.id)
    if (error) return { error: error.message }
  }
  // park names first so renames/swaps can't trip the unique name rule
  for (const d of clean.filter((x) => x.id)) await supabase.from('wl_divisions').update({ name: `__${d.id}` }).eq('id', d.id!).eq('competition_id', event.id)
  for (const [i, d] of clean.entries()) {
    const row = { name: d.name, level: d.level, sex: d.sex, sort_order: i + 1, competition_id: event.id }
    const { error } = d.id
      ? await supabase.from('wl_divisions').update(row).eq('id', d.id).eq('competition_id', event.id)
      : await supabase.from('wl_divisions').insert(row)
    if (error) return { error: error.message }
  }
  await audit(supabase, { competition_id: event.id, actor, action: 'divisions.save', entity: 'event', entity_id: event.id, before, after: clean })
  revalidatePath('/admin', 'layout')
  return { ok: true }
}
