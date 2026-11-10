import 'server-only'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { getPublicEvent, getPublicGym } from './public-data'

/** Northern Warrior: where the old single-event links (/, /schedule, /live…) point. */
export const HOME_GYM = 'northern-warrior'

export type EventParams = Promise<{ gym: string; event: string }>

/** The event for a /{gym}/{event}/… page, and the base path for its links. 404 if there's no such event. */
const loadEvent = cache((gym: string, slug: string) => getPublicEvent(gym, slug))
export async function eventFromParams(params: EventParams) {
  const { gym, event: slug } = await params
  const event = await loadEvent(gym, slug)
  if (!event) notFound()
  return { event, base: `/${event.gym.slug}/${event.slug}` }
}

/** Where the old links go: the home gym's current event (or its gym page if it has none). */
export async function currentEventBase() {
  const gym = await getPublicGym(HOME_GYM)
  return gym?.current ? `/${HOME_GYM}/${gym.current}` : `/${HOME_GYM}`
}
