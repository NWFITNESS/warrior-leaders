'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { withDefaults, type LivePromo } from '@/lib/live-promo'

export async function savePromo(input: LivePromo): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, actor } = await requireStaff()
  const promo = withDefaults({
    event_line: String(input.event_line ?? '').slice(0, 120),
    dj_label: String(input.dj_label ?? '').slice(0, 40),
    dj_name: String(input.dj_name ?? '').slice(0, 80),
    slide_seconds: Number(input.slide_seconds),
    slides: (input.slides ?? []).slice(0, 40).map((s) => ({ icon: String(s.icon ?? '').slice(0, 8), title: String(s.title ?? '').slice(0, 60), text: String(s.text ?? '').slice(0, 200) })),
    sponsors: (input.sponsors ?? []).slice(0, 40).map((s) => String(s).slice(0, 60)),
  })
  const { data: before } = await supabase.from('wl_competition_settings').select('live_promo').single()
  const { error } = await supabase.from('wl_competition_settings').update({ live_promo: promo }).eq('id', 1)
  if (error) return { error: error.message }
  await audit(supabase, { actor, action: 'live.promo', entity: 'settings', entity_id: '1', before: before?.live_promo, after: promo })
  revalidatePath('/admin/big-screen')
  return { ok: true }
}
