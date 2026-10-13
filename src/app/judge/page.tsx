'use client'

import { useCallback, useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { fetchAssignments, getCachedAssignments, getToken, logout, startSyncLoop, type Assignments } from '@/lib/judge-client'
import { SignIn } from './sign-in'
import { LaneList } from './lane-list'
import { LaneView } from './lane-view'
import { SyncBadge } from './sync-badge'

export default function JudgePage() {
  const [phase, setPhase] = useState<'loading' | 'signin' | 'app'>('loading')
  const [data, setData] = useState<Assignments | null>(null)
  const [laneId, setLaneId] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetchAssignments()
    if ('error' in res) {
      if (res.error === 'signed_out') { setData(null); setPhase('signin') }
      else setOffline(true)
      return
    }
    setOffline(false)
    setData(res)
    setPhase('app')
  }, [])

  useEffect(() => {
    if (!getToken()) { setPhase('signin'); return }
    const cached = getCachedAssignments()
    if (cached) { setData(cached); setPhase('app') }
    void refresh()
    const poll = window.setInterval(() => { if (navigator.onLine) void refresh() }, 30_000)
    const stop = startSyncLoop()
    return () => { window.clearInterval(poll); stop() }
  }, [refresh])

  const lane = data?.lanes.find((l) => l.lane_assignment_id === laneId) ?? null

  return (
    <main className="judge">
      {phase === 'loading' && <p className="subtle" style={{ textAlign: 'center', paddingTop: 80 }}>Loading…</p>}

      {phase === 'signin' && (
        <SignIn onSignedIn={() => { setPhase('loading'); void refresh() }} />
      )}

      {phase === 'app' && data && (
        <>
          <header className="j-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Logo width={72} />
              <span className="who">{data.judge.name}{data.judge.role === 'head' ? ' · Head judge' : ''}</span>
            </div>
            <SyncBadge offline={offline} />
          </header>

          {lane ? (
            <LaneView lane={lane} onBack={() => { setLaneId(null); void refresh() }} />
          ) : (
            <>
              <LaneList lanes={data.lanes} onOpen={setLaneId} onRefresh={refresh} />
              <button className="linkbtn" style={{ justifySelf: 'center', marginTop: 12 }}
                onClick={async () => { await logout(); setData(null); setPhase('signin') }}>
                Sign out
              </button>
            </>
          )}
        </>
      )}
    </main>
  )
}
