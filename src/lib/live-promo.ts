// What runs along the bottom of the big screen (/live): DJ, rotating info slides, sponsor ticker.
// Edited in Admin → Big screen (stored in wl_competition_settings.live_promo, read via wl_public_promo()).
// DEFAULT_PROMO is only the fallback when nothing has been saved yet.

export interface PromoSlide { icon: string; title: string; text: string }
export interface LivePromo {
  event_line: string
  dj_label: string
  dj_name: string
  slide_seconds: number
  slides: PromoSlide[]
  sponsors: string[]
}

export const DEFAULT_PROMO: LivePromo = {
  event_line: 'Same-sex Pairs · 7 November 2026',
  dj_label: 'On the decks',
  dj_name: '',
  slide_seconds: 8,
  slides: [{ icon: '📱', title: 'Live scores', text: 'Heats, workouts and the leaderboard on your phone: leaders.northernwarrior.co.uk' }],
  sponsors: [],
}

/** Saved promo merged over the defaults, so a half-filled row still renders. */
export function withDefaults(p: Partial<LivePromo> | null | undefined): LivePromo {
  const v = { ...DEFAULT_PROMO, ...(p ?? {}) }
  return {
    ...v,
    slide_seconds: Math.min(60, Math.max(3, Number(v.slide_seconds) || 8)),
    slides: (v.slides ?? []).filter((s) => s && (s.title || s.text)),
    sponsors: (v.sponsors ?? []).map((s) => String(s).trim()).filter(Boolean),
  }
}
