'use client'

import { useEffect, useRef, useState } from 'react'

// Captain's signature, drawn with a finger. Stored as a compact SVG path in a 300×120 box,
// so it's tiny, works offline and renders sharply anywhere (admin, audit).
const W = 300
const H = 120

export function SignaturePad({ value, onChange, disabled }: { value: string; onChange: (path: string) => void; disabled?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [path, setPath] = useState(value)
  const drawing = useRef(false)
  const pathRef = useRef(value)
  useEffect(() => { if (!drawing.current) { setPath(value); pathRef.current = value } }, [value])

  const point = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * W)
    const y = Math.round(((e.clientY - r.top) / r.height) * H)
    return `${Math.max(0, Math.min(W, x))} ${Math.max(0, Math.min(H, y))}`
  }
  const down = (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    svgRef.current!.setPointerCapture(e.pointerId)
    drawing.current = true
    pathRef.current = `${pathRef.current}M${point(e)}`
    setPath(pathRef.current)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    pathRef.current = `${pathRef.current}L${point(e)}`
    setPath(pathRef.current)
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    // a single dot isn't a signature: needs at least one drawn line
    onChange(pathRef.current.includes('L') ? pathRef.current : '')
  }

  return (
    <div className={`j-sig${path ? ' signed' : ''}`}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Signature box: sign with your finger"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <line x1="16" x2={W - 16} y1={H - 26} y2={H - 26} className="base" />
        {path && <path d={path} />}
      </svg>
      {!path && <span className="hint">Sign here</span>}
      {path && !disabled && <button type="button" className="clear" onClick={() => { pathRef.current = ''; setPath(''); onChange('') }}>Clear</button>}
    </div>
  )
}

/** Read-only signature (admin, submitted scores). */
export function SignatureImage({ path, height = 48 }: { path: string | null | undefined; height?: number }) {
  if (!path) return null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height, width: (height * W) / H, display: 'block' }} role="img" aria-label="Captain's signature">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
