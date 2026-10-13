'use client'

import { useEffect, useState } from 'react'
import { onSyncChange, syncState } from '@/lib/judge-client'

export function SyncBadge({ offline }: { offline: boolean }) {
  const [state, setState] = useState(() => ({ pending: 0, syncing: false, error: null as string | null }))
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setState(syncState())
    update()
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const unsub = onSyncChange(update)
    return () => { unsub(); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (!online || offline || state.error === 'offline') {
    return <span className="j-sync bad">No signal · {state.pending ? `${state.pending} saved on phone` : 'scores safe on phone'}</span>
  }
  if (state.pending) return <span className="j-sync wait">Sending {state.pending}…</span>
  return <span className="j-sync ok">● Synced</span>
}
