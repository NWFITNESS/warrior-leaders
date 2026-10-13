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
    <div className="stack" style={{ paddingTop: 12 }}>
      <div style={{ justifySelf: 'center' }}><Logo width={200} /></div>
      <div className="stack-sm" style={{ textAlign: 'center' }}>
        <span className="eyebrow">The Warrior Leaders · Judges</span>
        <h1 style={{ fontSize: '1.8rem' }}>{judge ? `Hi ${judge.name.split(' ')[0]}` : 'Who’s judging?'}</h1>
      </div>

      {loadError && <p className="notice notice-bad">Can’t reach the server. Check your signal and reload the page.</p>}
      {!judges && !loadError && <p className="subtle" style={{ textAlign: 'center' }}>Loading judges…</p>}

      {judges && !judge && (
        <div className="stack-sm">
          {judges.length === 0 && <p className="notice">No judges have been set up yet. Ask the head judge.</p>}
          {judges.map((j) => (
            <button key={j.id} type="button" className="j-name" onClick={() => setJudgeId(j.id)}>
              {j.name}
              {j.role === 'head' && <span className="pill pill-gold">Head judge</span>}
            </button>
          ))}
        </div>
      )}

      {judge && (
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Today’s judge code</span>
            <input id="judge-code" className="input j-code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          {error && <p className="notice notice-bad">{error}</p>}
          <button className="btn j-big" disabled={busy || code.length !== 4}>{busy ? 'Checking…' : 'Start judging'}</button>
          <button type="button" className="linkbtn" style={{ justifySelf: 'center' }} onClick={() => { setJudgeId(null); setCode(''); setError('') }}>
            Not {judge.name.split(' ')[0]}? Pick another name
          </button>
        </form>
      )}
    </div>
  )
}
