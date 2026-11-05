'use client'

import { useEffect, useState } from 'react'
import { DJ, SLIDES, SLIDE_SECONDS, SPONSORS } from '@/lib/live-promo'

/** Bottom of the big screen: DJ + looping equaliser, rotating vendor/info slides, scan-for-scores QR, sponsor ticker. */
export function StageBar({ qr }: { qr: string | null }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % SLIDES.length), SLIDE_SECONDS * 1000)
    return () => window.clearInterval(id)
  }, [])
  const s = SLIDES[i]
  const ticker = [...SPONSORS, ...SPONSORS] // doubled so the loop is seamless

  return (
    <div className="stage-wrap">
      <div className="stage">
        <div className="stage-dj">
          <div className="eq" aria-hidden>{Array.from({ length: 14 }, (_, k) => <i key={k} style={{ animationDelay: `${(k * 137) % 900 / -1000}s`, animationDuration: `${0.7 + ((k * 53) % 50) / 100}s` }} />)}</div>
          <div><span>{DJ.label}</span><b>{DJ.name}</b></div>
        </div>

        <div className="stage-slide">
          <div key={i} className="slide">
            <span className="ic" aria-hidden>{s.icon}</span>
            <div><b>{s.title}</b><p>{s.text}</p></div>
          </div>
          <span className="dots" aria-hidden>{SLIDES.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span>
          <span key={`p${i}`} className="prog" style={{ animationDuration: `${SLIDE_SECONDS}s` }} />
        </div>

        {qr && (
          <div className="stage-qr">
            <div className="q" dangerouslySetInnerHTML={{ __html: qr }} />
            <span>Live scores<br /><b>scan me</b></span>
          </div>
        )}
      </div>

      <div className="sponsors">
        <span className="lbl">Big thanks to our sponsors</span>
        <div className="track"><div className="run">{ticker.map((n, k) => <span key={k}>{n}<i>◆</i></span>)}</div></div>
      </div>
    </div>
  )
}
