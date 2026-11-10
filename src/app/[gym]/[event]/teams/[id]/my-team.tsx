'use client'

import { useEffect, useState } from 'react'

/** Remembers "my team" on this phone so it's highlighted on the leaderboard. */
export function MyTeamButton({ teamId }: { teamId: string }) {
  const [mine, setMine] = useState(false)
  useEffect(() => { try { setMine(localStorage.getItem('wl-my-team') === teamId) } catch { /* blocked */ } }, [teamId])
  const toggle = () => {
    try {
      if (mine) localStorage.removeItem('wl-my-team'); else localStorage.setItem('wl-my-team', teamId)
      setMine(!mine)
    } catch { /* blocked */ }
  }
  return (
    <button type="button" className={`btn btn-sm ${mine ? '' : 'btn-ghost'}`} style={{ justifySelf: 'start' }} onClick={toggle}>
      {mine ? '★ My team (highlighted on the leaderboard)' : '☆ This is my team'}
    </button>
  )
}
