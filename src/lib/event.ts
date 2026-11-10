import { cache } from 'react'
import { cookies } from 'next/headers'
import { requireStaff } from '@/lib/auth'
import type { CompEvent } from '@/lib/types'

/** The admin's chosen event is remembered in this cookie (set by the event switcher). */
export const EVENT_COOKIE = 'wl_event'
export const GYM_SLUG = 'northern-warrior' // the only gym until Phase 5 (gym logins)

/**
 * Staff client + the event the admin is working on: the one picked in the switcher,
 * else the gym's current event, else its newest. Cached per request.
 */
export const requireEvent = cache(async () => {
  const { supabase, actor } = await requireStaff()
  const jar = await cookies()
  const wanted = jar.get(EVENT_COOKIE)?.value
  let event: CompEvent | null = null
  if (wanted) event = (await supabase.from('wl_competitions').select('*').eq('id', wanted).maybeSingle<CompEvent>()).data
  if (!event) {
    const { data: gym } = await supabase.from('wl_gyms').select('id, current_competition_id').eq('slug', GYM_SLUG).single()
    if (gym?.current_competition_id) event = (await supabase.from('wl_competitions').select('*').eq('id', gym.current_competition_id).maybeSingle<CompEvent>()).data
    if (!event && gym) event = (await supabase.from('wl_competitions').select('*').eq('gym_id', gym.id).order('start_date', { ascending: false, nullsFirst: false }).limit(1).maybeSingle<CompEvent>()).data
  }
  if (!event) throw new Error('No events yet: create one in Admin → Events')
  return { supabase, actor, event }
})

export { eventDates } from '@/lib/dates'
