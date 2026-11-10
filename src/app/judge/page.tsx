'use client'

import { useCallback, useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { claimLane, fetchAssignments, getCachedAssignments, getToken, logout, openSideLane, startSyncLoop, type Assignments } from '@/lib/judge-client'
import { SignIn } from './sign-in'
import { LaneList } from './lane-list'
import { LaneView } from './lane-view'
import { SyncBadge } from './sync-badge'
import { HeatBoard } from './heat-board'
import { WorkoutSheet } from './workout-sheet'

type HeadTab = 'heats' | 'side' | 'workouts'

export default function JudgePage() {
  const [phase, setPhase] = useState<'loading' | 'signin' | 'app'>('loading')
  const [data, setData] = useState<Assignments | null>(null)
  const [laneId, setLaneId] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [tab, setTab] = useState<HeadTab>('heats')

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

  // opening (or leaving) a lane starts at the top of the screen
  useEffect(() => { window.scrollTo(0, 0) }, [laneId])

  const lane = data?.lanes.find((l) => l.lane_assignment_id === laneId) ?? null
  const head = data?.judge.role === 'head'
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

  // heat lane: take it (head judges just open it) → open the scoring screen
  async function takeLane(id: string, force: boolean) {
    if (head && data?.lanes.some((l) => l.lane_assignment_id === id)) { setLaneId(id); return { laneId: id } }
    const res = await claimLane(id, force)
    if ('error' in res) {
      if (res.error === 'signed_out') { setData(null); setPhase('signin') }
      return res
    }
    await refresh()
    setLaneId(res.laneId)
    return res
  }

  const sideLanes = data?.lanes.filter((l) => l.workout.open_entry) ?? []
  const hasSide = (data?.open_events?.length ?? 0) > 0

  return (
    <main className="judge">
      {phase === 'loading' && <p className="subtle" style={{ textAlign: 'center', paddingTop: 80 }}>Loading…</p>}

      {phase === 'signin' && (
        <SignIn onSignedIn={() => { setPhase('loading'); setTab('heats'); void refresh() }} />
      )}

      {phase === 'app' && data && (
        <>
          <header className="j-top">
            {lane ? (
              <button type="button" className="j-back" onClick={() => { setLaneId(null); void refresh() }}>‹ {head ? 'Heats' : 'Lanes'}</button>
            ) : (
              <span className="j-brand"><Logo width={40} variant="mark" /></span>
            )}
            <span className="j-title">
              {lane ? (lane.workout.open_entry ? `Event ${lane.workout.number} · Side event` : `Lane ${lane.lane} · Heat ${lane.heat_number}`) : <>{data.judge.name}{(head || data.event) && <small>{[head && 'Head judge', data.event?.name].filter(Boolean).join(' · ')}</small>}</>}
            </span>
            <SyncBadge offline={offline} />
          </header>

          {lane ? (
            <LaneView lane={lane} />
          ) : head ? (
            <>
              <div className="j-tabs j-head-tabs" role="tablist">
                <button type="button" role="tab" aria-pressed={tab === 'heats'} onClick={() => setTab('heats')}>Heats</button>
                {hasSide && <button type="button" role="tab" aria-pressed={tab === 'side'} onClick={() => setTab('side')}>Side event</button>}
                <button type="button" role="tab" aria-pressed={tab === 'workouts'} onClick={() => setTab('workouts')}>Workouts</button>
              </div>
              {tab === 'heats' && <HeatBoard heats={data.heats ?? []} workouts={data.workouts ?? []} judgeId={data.judge.id} head onTake={takeLane} />}
              {tab === 'side' && hasSide && (
                <LaneList lanes={sideLanes} openEvents={data.open_events ?? []} onOpen={setLaneId} onRefresh={refresh} onScoreTeam={scoreTeam} sideError={sideError} showJudge />
              )}
              {tab === 'workouts' && <WorkoutSheet workouts={data.workouts ?? []} heats={data.heats ?? []} />}
              <SignOut onDone={() => { setData(null); setPhase('signin') }} />
            </>
          ) : (
            <>
              <LaneList lanes={data.lanes} openEvents={data.open_events ?? []} onOpen={setLaneId} onRefresh={refresh} onScoreTeam={scoreTeam} sideError={sideError} title="Your lane">
                <div className="j-pick-title">
                  <h2>Pick a lane</h2>
                  <p className="j-note">Tap the lane you’re judging. It’s yours until you’ve submitted.</p>
                </div>
                <HeatBoard heats={data.heats ?? []} workouts={data.workouts ?? []} judgeId={data.judge.id} head={false} onTake={takeLane} />
              </LaneList>
              <SignOut onDone={() => { setData(null); setPhase('signin') }} />
            </>
          )}
        </>
      )}
    </main>
  )
}

function SignOut({ onDone }: { onDone: () => void }) {
  return (
    <button type="button" className="j-tool" style={{ justifySelf: 'center', marginTop: 8 }}
      onClick={async () => { await logout(); onDone() }}>
      Sign out
    </button>
  )
}
