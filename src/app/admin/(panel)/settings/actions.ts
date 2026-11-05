'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import type { PointsMethod } from '@/lib/types'

export async function saveSettings(_prev: { ok?: boolean; error?: string }, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, actor } = await requireStaff()
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

  const row = {
    name: String(formData.get('name') ?? '').trim() || 'Warrior Leaders',
    competition_name: String(formData.get('competition_name') ?? '').trim() || 'Northern Warrior Competitions',
    event_date: String(formData.get('event_date')),
    venue: String(formData.get('venue') ?? '').trim(),
    points_method: method,
    custom_points: custom,
    lanes_per_heat: lanes,
    judge_code: code,
    head_judge_code: headCode,
    overall_tiebreak: String(formData.get('overall_tiebreak') ?? '').trim(),
    updated_at: new Date().toISOString(),
  }
  const { data: before } = await supabase.from('wl_competition_settings').select('*').single()
  const { error } = await supabase.from('wl_competition_settings').update(row).eq('id', 1)
  if (error) return { error: error.message }
  await audit(supabase, { actor, action: 'settings.update', entity: 'settings', entity_id: '1', before, after: row })
  revalidatePath('/admin', 'layout')
  return { ok: true }
}
