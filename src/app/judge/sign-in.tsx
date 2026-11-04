'use client'

import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { listJudges, login, register } from '@/lib/judge-client'

const ERRORS: Record<string, string> = {
  wrong_code: 'That code isn’t right. Check the code from the judges’ briefing.',
  locked: 'Too many wrong codes. Wait 15 minutes or ask the head judge.',
  unknown_judge: 'That head judge isn’t active any more. Ask the organiser.',
  bad_name: 'Type your first and last name.',
  head_name: 'That’s a head judge’s name. Use “Head judge sign in” below.',
  inactive: 'That name has been switched off. Ask the head judge.',
  offline: 'No signal. Move closer to the Wi-Fi and try again.',
}

const LAST_NAME = 'wl-judge-name'

function CodeInput({ code, setCode, autoFocus }: { code: string; setCode: (c: string) => void; autoFocus?: boolean }) {
  return (
    <input id="judge-code" className="j-code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} autoFocus={autoFocus}
      aria-label="Code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
  )
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'lane' | 'head'>('lane')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // head judges: picked from the list set up in admin
  const [heads, setHeads] = useState<{ id: string; name: string }[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [headId, setHeadId] = useState<string | null>(null)
  const head = heads?.find((j) => j.id === headId)

  useEffect(() => {
    try { setName(localStorage.getItem(LAST_NAME) ?? '') } catch { /* private mode */ }
  }, [])
  useEffect(() => {
    if (mode === 'head' && !heads) listJudges().then(setHeads, () => setLoadError(true))
  }, [mode, heads])

  function switchMode(m: 'lane' | 'head') { setMode(m); setCode(''); setError(''); setHeadId(null) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 4) return
    setBusy(true)
    setError('')
    const res = mode === 'head' ? await login(headId!, code) : await register(name, code)
    setBusy(false)
    if ('error' in res) { setError(ERRORS[res.error] ?? 'Something went wrong. Try again.'); if (res.error !== 'bad_name' && res.error !== 'head_name') setCode('') }
    else {
      if (mode === 'lane') { try { localStorage.setItem(LAST_NAME, name.trim()) } catch { /* ignore */ } }
      onSignedIn()
    }
  }

  if (mode === 'head') {
    return (
      <div className="j-signin">
        <div className="j-signin-logo"><Logo width={150} variant="stacked" /></div>
        <div className="j-signin-head">
          <h1>{head ? `Hi ${head.name.split(' ')[0]}` : 'Head judge sign in'}</h1>
          <p className="j-note">{head ? 'Enter the 4-digit head judge code.' : 'Pick your name.'}</p>
        </div>
        {loadError && <div className="j-banner bad">Can’t reach the server. Check your signal and reload the page.</div>}
        {!heads && !loadError && <p className="j-note" style={{ textAlign: 'center' }}>Loading…</p>}
        {heads && !head && (
          <div className="j-group">
            {heads.length === 0 && <p className="j-note" style={{ padding: 16 }}>No head judges have been set up. Add them in Admin → Judges.</p>}
            {heads.map((j) => (
              <button key={j.id} type="button" className="j-name" onClick={() => setHeadId(j.id)}>
                <span>{j.name}</span>
                <span className="chev" aria-hidden>›</span>
              </button>
            ))}
          </div>
        )}
        {head && (
          <form onSubmit={submit} className="j-signin-form">
            <label><span className="j-label">Head judge code</span><CodeInput code={code} setCode={setCode} autoFocus /></label>
            {error && <div className="j-banner bad">{error}</div>}
            <button className="j-primary" disabled={busy || code.length !== 4}>{busy ? 'Checking…' : 'Sign in'}</button>
          </form>
        )}
        <button type="button" className="j-tool" style={{ justifySelf: 'center' }} onClick={() => (head ? setHeadId(null) : switchMode('lane'))}>
          {head ? 'Pick another name' : '‹ Back to judge sign in'}
        </button>
      </div>
    )
  }

  return (
    <div className="j-signin">
      <div className="j-signin-logo"><Logo width={150} variant="stacked" /></div>
      <div className="j-signin-head">
        <h1>Judge sign in</h1>
        <p className="j-note">Your name and today’s 4-digit judge code from the briefing.</p>
      </div>
      <form onSubmit={submit} className="j-signin-form">
        <label>
          <span className="j-label">Your name</span>
          <input id="judge-name" className="j-search" autoComplete="name" autoCapitalize="words" maxLength={40} placeholder="First and last name"
            value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label><span className="j-label">Judge code</span><CodeInput code={code} setCode={setCode} /></label>
        {error && <div className="j-banner bad">{error}</div>}
        <button className="j-primary" disabled={busy || code.length !== 4 || name.trim().length < 2}>{busy ? 'Checking…' : 'Start judging'}</button>
      </form>
      <button type="button" className="j-tool" style={{ justifySelf: 'center' }} onClick={() => switchMode('head')}>Head judge sign in</button>
    </div>
  )
}
