'use client'

import { useState } from 'react'

export function CopyLink({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className="btn btn-ghost btn-sm"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }, () => {})}>
      {done ? 'Copied' : 'Copy link'}
    </button>
  )
}
