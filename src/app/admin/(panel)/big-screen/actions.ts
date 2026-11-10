'use server'

import { revalidatePath } from 'next/cache'
import { requireEvent } from '@/lib/event'
import { audit } from '@/lib/audit'
import { withDefaults, type LivePromo } from '@/lib/live-promo'

export async function savePromo(input: LivePromo): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, actor, event } = await requireEvent()
  const promo = withDefaults({
    event_line: String(input.event_line ?? '').slice(0, 120),
    dj_label: String(input.dj_label ?? '').slice(0, 40),
    dj_name: String(input.dj_name ?? '').slice(0, 80),
    slide_seconds: Number(input.slide_seconds),
    slides: (input.slides ?? []).slice(0, 40).map((s) => ({ icon: String(s.icon ?? '').slice(0, 8), title: String(s.title ?? '').slice(0, 60), text: String(s.text ?? '').slice(0, 200) })),
    sponsors: (input.sponsors ?? []).slice(0, 40).map((s) => String(s).slice(0, 60)),
  })
  const before = { live_promo: event.live_promo }
  const { error } = await supabase.from('wl_competitions').update({ live_promo: promo, updated_at: new Date().toISOString() }).eq('id', event.id)
  if (error) return { error: error.message }
  await audit(supabase, { competition_id: event.id, actor, action: 'live.promo', entity: 'event', entity_id: event.id, before: before.live_promo, after: promo })
  revalidatePath('/admin/big-screen')
  return { ok: true }
}
