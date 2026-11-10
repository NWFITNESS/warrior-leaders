'use client'

import { useEffect, useState } from 'react'
import type { LivePromo } from '@/lib/live-promo'

/** Bottom of the big screen: DJ + looping equaliser, rotating vendor/info slides, scan-for-scores QR, sponsor ticker. */
export function StageBar({ qr, promo }: { qr: string | null; promo: LivePromo }) {
  const slides = promo.slides
  const [i, setI] = useState(0)
  useEffect(() => {
    if (slides.length < 2) return
    const id = window.setInterval(() => setI((n) => (n + 1) % slides.length), promo.slide_seconds * 1000)
    return () => window.clearInterval(id)
  }, [slides.length, promo.slide_seconds])
  const s = slides[i % Math.max(1, slides.length)]
  const ticker = [...promo.sponsors, ...promo.sponsors] // doubled so the loop is seamless

  return (
    <div className="stage-wrap">
      <div className={`stage${promo.dj_name ? '' : ' no-dj'}`}>
        {promo.dj_name && (
          <div className="stage-dj">
            <div className="eq" aria-hidden>{Array.from({ length: 14 }, (_, k) => <i key={k} style={{ animationDelay: `${(k * 137) % 900 / -1000}s`, animationDuration: `${0.7 + ((k * 53) % 50) / 100}s` }} />)}</div>
            <div><span>{promo.dj_label}</span><b>{promo.dj_name}</b></div>
          </div>
        )}

        <div className="stage-slide">
          {s && (
            <div key={i} className="slide">
              {s.icon && <span className="ic" aria-hidden>{s.icon}</span>}
              <div><b>{s.title}</b><p>{s.text}</p></div>
            </div>
          )}
          {slides.length > 1 && <span className="dots" aria-hidden>{slides.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span>}
          {slides.length > 1 && <span key={`p${i}`} className="prog" style={{ animationDuration: `${promo.slide_seconds}s` }} />}
        </div>

        {qr && (
          <div className="stage-qr">
            <div className="q" dangerouslySetInnerHTML={{ __html: qr }} />
            <span>Live scores<br /><b>scan me</b></span>
          </div>
        )}
      </div>

      {promo.sponsors.length > 0 && (
        <div className="sponsors">
          <span className="lbl">Big thanks to our sponsors</span>
          <div className="track"><div className="run" style={{ animationDuration: `${Math.max(20, promo.sponsors.length * 5)}s` }}>{ticker.map((n, k) => <span key={k}>{n}<i>◆</i></span>)}</div></div>
        </div>
      )}
    </div>
  )
}
