'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { EVENT_COOKIE, GYM_SLUG } from '@/lib/event'

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

async function gym() {
  const { supabase, actor } = await requireStaff()
  const { data } = await supabase.from('wl_gyms').select('id, current_competition_id').eq('slug', GYM_SLUG).single()
  if (!data) throw new Error('Gym not found')
  return { supabase, actor, gym: data }
}

async function remember(id: string) {
  const jar = await cookies()
  jar.set(EVENT_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 })
}

/** Work on another event in the admin. */
export async function switchEvent(formData: FormData) {
  const { supabase, gym: g } = await gym()
  const id = String(formData.get('id') ?? '')
  const { data } = await supabase.from('wl_competitions').select('id').eq('id', id).eq('gym_id', g.id).maybeSingle()
  if (!data) throw new Error('Event not found')
  await remember(id)
  revalidatePath('/admin', 'layout')
  redirect(String(formData.get('next') || '/admin'))
}

/** The event the public site and the judges' app show (until each event gets its own address). */
export async function makePublicEvent(formData: FormData) {
  const { supabase, actor, gym: g } = await gym()
  const id = String(formData.get('id') ?? '')
  const { data } = await supabase.from('wl_competitions').select('id').eq('id', id).eq('gym_id', g.id).maybeSingle()
  if (!data) throw new Error('Event not found')
  const { error } = await supabase.from('wl_gyms').update({ current_competition_id: id }).eq('id', g.id)
  if (error) throw new Error(error.message)
  await audit(supabase, { competition_id: id, actor, action: 'event.make_public', entity: 'event', entity_id: id, before: { current: g.current_competition_id }, after: { current: id } })
  revalidatePath('/', 'layout')
}

function friendly(msg: string) {
  if (msg.includes('wl_competitions_gym_id_slug_key')) return 'Another event already uses that web address.'
  if (msg.includes('judge_code_taken')) return 'Another open event is using one of these judge codes. Try again.'
  return msg
}

export async function createEvent(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const { supabase, actor, gym: g } = await gym()
  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const start = String(formData.get('start_date') ?? '')
  const end = String(formData.get('end_date') ?? '') || start
  const copyFrom = String(formData.get('copy_from') ?? '')
  if (!name) return { error: 'Give the event a name.' }
  if (!SLUG.test(slug)) return { error: 'The web address can only use lower-case letters, numbers and single dashes.' }
  if (!DATE.test(start)) return { error: 'Pick the start date.' }
  if (!DATE.test(end) || end < start) return { error: 'The end date can’t be before the start date.' }

  let base: Record<string, unknown> = {}
  if (copyFrom) {
    const { data: src } = await supabase.from('wl_competitions')
      .select('short_name, venue, points_method, custom_points, lanes_per_heat, overall_tiebreak, live_promo').eq('id', copyFrom).eq('gym_id', g.id).maybeSingle()
    if (src) base = src
  }
  // codes no other open event uses: a judge's code tells the app which event they're at
  const { data: head, error: hErr } = await supabase.rpc('wl_free_judge_code')
  const { data: judge, error: jErr } = await supabase.rpc('wl_free_judge_code', { p_not: head })
  if (hErr || jErr) return { error: (hErr ?? jErr)!.message }
  const { data: ev, error } = await supabase.from('wl_competitions').insert({
    ...base,
    gym_id: g.id, name, slug, start_date: start, end_date: end, status: 'draft',
    venue: String(formData.get('venue') ?? '').trim() || (base.venue as string) || '',
    judge_code: judge, head_judge_code: head,
  }).select('id').single()
  if (error) return { error: friendly(error.message) }

  if (copyFrom && (formData.get('copy_divisions') || formData.get('copy_workouts'))) {
    const { error: cErr } = await supabase.rpc('wl_admin_copy_event', {
      p_from: copyFrom, p_to: ev.id, p_divisions: !!formData.get('copy_divisions'), p_workouts: !!formData.get('copy_workouts'),
    })
    if (cErr) return { error: `Event created, but copying failed: ${cErr.message}` }
  }
  await audit(supabase, { competition_id: ev.id, actor, action: 'event.create', entity: 'event', entity_id: ev.id, after: { name, slug, start, end, copy_from: copyFrom || null } })
  await remember(ev.id)
  revalidatePath('/admin', 'layout')
  redirect('/admin/settings')
}
