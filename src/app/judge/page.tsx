'use client'

import { useCallback, useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { fetchAssignments, getCachedAssignments, getToken, logout, openSideLane, startSyncLoop, type Assignments } from '@/lib/judge-client'
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
  const [sideError, setSideError] = useState('')

  // side event: pick a team → get (or create) their lane → open the scoring screen
  async function scoreTeam(workoutId: string, teamId: string) {
    setSideError('')
    const res = await openSideLane(workoutId, teamId)
    if ('error' in res) { setSideError(res.error === 'offline' ? 'No signal. Move closer to the Wi-Fi and try again.' : 'Couldn’t open that team. Ask the head judge.'); return false }
    await refresh()
    setLaneId(res.laneId)
    return true
  }

  return (
    <main className="judge">
      {phase === 'loading' && <p className="subtle" style={{ textAlign: 'center', paddingTop: 80 }}>Loading…</p>}

      {phase === 'signin' && (
        <SignIn onSignedIn={() => { setPhase('loading'); void refresh() }} />
      )}

      {phase === 'app' && data && (
        <>
          <header className="j-top">
            {lane ? (
              <button type="button" className="j-back" onClick={() => { setLaneId(null); void refresh() }}>‹ Lanes</button>
            ) : (
              <span className="j-brand"><Logo width={40} variant="mark" /></span>
            )}
            <span className="j-title">
              {lane ? (lane.workout.open_entry ? `Event ${lane.workout.number} · Side event` : `Lane ${lane.lane} · Heat ${lane.heat_number}`) : <>{data.judge.name}{data.judge.role === 'head' && <small>Head judge</small>}</>}
            </span>
            <SyncBadge offline={offline} />
          </header>

          {lane ? (
            <LaneView lane={lane} />
          ) : (
            <>
              <LaneList lanes={data.lanes} openEvents={data.open_events ?? []} onOpen={setLaneId} onRefresh={refresh} onScoreTeam={scoreTeam} sideError={sideError} showJudge={data.judge.role === 'head'} />
              <button type="button" className="j-tool" style={{ justifySelf: 'center', marginTop: 8 }}
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
