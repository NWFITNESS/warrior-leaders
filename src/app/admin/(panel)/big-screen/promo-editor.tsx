'use client'

import { useState, useTransition } from 'react'
import type { LivePromo, PromoSlide } from '@/lib/live-promo'
import { savePromo } from './actions'

export function PromoEditor({ initial }: { initial: LivePromo }) {
  const [p, setP] = useState<LivePromo>(initial)
  const [sponsorText, setSponsorText] = useState(initial.sponsors.join('\n'))
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  const set = (patch: Partial<LivePromo>) => { setP((x) => ({ ...x, ...patch })); setDirty(true); setMsg({}) }
  const setSlide = (i: number, patch: Partial<PromoSlide>) => set({ slides: p.slides.map((s, k) => (k === i ? { ...s, ...patch } : s)) })
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= p.slides.length) return
    const next = [...p.slides]; [next[i], next[j]] = [next[j], next[i]]; set({ slides: next })
  }

  function save() {
    start(async () => {
      const res = await savePromo({ ...p, sponsors: sponsorText.split('\n') })
      if (res.error) setMsg({ error: res.error })
      else { setMsg({ ok: 'Saved. The TV picks it up within a minute.' }); setDirty(false) }
    })
  }

  return (
    <div className="stack">
      <section className="card stack">
        <h2>Header &amp; DJ</h2>
        <div className="grid-3">
          <label className="field"><span>Line under the clock</span><input className="input" value={p.event_line} onChange={(e) => set({ event_line: e.target.value })} /></label>
          <label className="field"><span>DJ label</span><input className="input" value={p.dj_label} placeholder="On the decks" onChange={(e) => set({ dj_label: e.target.value })} /></label>
          <label className="field"><span>DJ name (blank hides the DJ box)</span><input className="input" value={p.dj_name} onChange={(e) => set({ dj_name: e.target.value })} /></label>
        </div>
      </section>

      <section className="card stack">
        <div className="spread" style={{ alignItems: 'center' }}>
          <h2>Info slides <span className="small subtle">({p.slides.length})</span></h2>
          <label className="row small muted" style={{ gap: 8 }}>Each slide shows for
            <input className="input mono" style={{ width: 64 }} inputMode="numeric" value={p.slide_seconds} onChange={(e) => set({ slide_seconds: Number(e.target.value.replace(/\D/g, '')) || 0 })} /> seconds
          </label>
        </div>
        <p className="small subtle">Vendors, food, physio, reminders… One emoji as the icon (optional), a short title and one line of text. They rotate in this order.</p>
        <div className="stack-sm">
          {p.slides.map((s, i) => (
            <div key={i} className="promo-slide">
              <input className="input ic" value={s.icon} maxLength={8} aria-label="Icon" placeholder="☕" onChange={(e) => setSlide(i, { icon: e.target.value })} />
              <input className="input" value={s.title} aria-label="Title" placeholder="Title" onChange={(e) => setSlide(i, { title: e.target.value })} />
              <input className="input t2" value={s.text} aria-label="Text" placeholder="One line of text" onChange={(e) => setSlide(i, { text: e.target.value })} />
              <span className="promo-ctl">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                <button type="button" aria-label="Move down" disabled={i === p.slides.length - 1} onClick={() => move(i, 1)}>▼</button>
                <button type="button" aria-label="Remove slide" onClick={() => set({ slides: p.slides.filter((_, k) => k !== i) })}>✕</button>
              </span>
            </div>
          ))}
          {p.slides.length === 0 && <div className="empty">No slides. Add one below.</div>}
        </div>
        <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ slides: [...p.slides, { icon: '', title: '', text: '' }] })}>+ Add a slide</button></div>
      </section>

      <section className="card stack">
        <h2>Sponsor ticker</h2>
        <p className="small subtle">One sponsor per line. They scroll along the gold strip at the bottom. Leave empty to hide the strip.</p>
        <textarea className="input" rows={9} value={sponsorText} onChange={(e) => { setSponsorText(e.target.value); setDirty(true); setMsg({}) }} />
      </section>

      {msg.error && <p className="notice notice-bad">{msg.error}</p>}
      {msg.ok && <p className="notice notice-ok">{msg.ok}</p>}
      <div className="row">
        <button type="button" className="btn" disabled={pending || !dirty} onClick={save}>{pending ? 'Saving…' : 'Save big screen'}</button>
        {dirty && <span className="small subtle">Unsaved changes</span>}
      </div>
    </div>
  )
}
