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
    return <span className="j-sync bad"><i />{state.pending ? `Offline · ${state.pending} saved` : 'Offline · saved on phone'}</span>
  }
  if (state.pending) return <span className="j-sync wait"><i />Sending…</span>
  return <span className="j-sync ok"><i />Synced</span>
}
