'use client'

import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { listJudges, login } from '@/lib/judge-client'

const ERRORS: Record<string, string> = {
  wrong_code: 'That code isn’t right. Check the code from the judges’ briefing.',
  locked: 'Too many wrong codes. Wait 15 minutes or ask the head judge.',
  unknown_judge: 'Your name isn’t active any more. Ask the head judge.',
  offline: 'No signal. Move closer to the Wi-Fi and try again.',
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [judges, setJudges] = useState<{ id: string; name: string; role: string }[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [judgeId, setJudgeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listJudges().then(setJudges, () => setLoadError(true))
  }, [])

  const judge = judges?.find((j) => j.id === judgeId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!judgeId || code.length !== 4) return
    setBusy(true)
    setError('')
    const res = await login(judgeId, code)
    setBusy(false)
    if ('error' in res) { setError(ERRORS[res.error] ?? 'Something went wrong. Try again.'); setCode('') }
    else onSignedIn()
  }

  return (
    <div className="j-signin">
      <div className="j-signin-logo"><Logo width={150} variant="stacked" /></div>
      <div className="j-signin-head">
        <h1>{judge ? `Hi ${judge.name.split(' ')[0]}` : 'Who’s judging?'}</h1>
        <p className="j-note">{judge ? 'Enter today’s 4-digit judge code from the briefing.' : 'Pick your name to start.'}</p>
      </div>

      {loadError && <div className="j-banner bad">Can’t reach the server. Check your signal and reload the page.</div>}
      {!judges && !loadError && <p className="j-note" style={{ textAlign: 'center' }}>Loading judges…</p>}

      {judges && !judge && (
        <div className="j-group">
          {judges.length === 0 && <p className="j-note" style={{ padding: 16 }}>No judges have been set up yet. Ask the head judge.</p>}
          {judges.map((j) => (
            <button key={j.id} type="button" className="j-name" onClick={() => setJudgeId(j.id)}>
              <span>{j.name}</span>
              {j.role === 'head' && <small>Head judge</small>}
              <span className="chev" aria-hidden>›</span>
            </button>
          ))}
        </div>
      )}

      {judge && (
        <form onSubmit={submit} className="j-signin-form">
          <label>
            <span className="j-label">Judge code</span>
            <input id="judge-code" className="j-code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          {error && <div className="j-banner bad">{error}</div>}
          <button className="j-primary" disabled={busy || code.length !== 4}>{busy ? 'Checking…' : 'Start judging'}</button>
          <button type="button" className="j-tool" style={{ justifySelf: 'center' }} onClick={() => { setJudgeId(null); setCode(''); setError('') }}>
            Not {judge.name.split(' ')[0]}? Pick another name
          </button>
        </form>
      )}
    </div>
  )
}
