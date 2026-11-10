'use client'

import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { headsForCode, login, register } from '@/lib/judge-client'

const ERRORS: Record<string, string> = {
  wrong_code: 'That code isn’t right. Check the code from the judges’ briefing.',
  locked: 'Too many wrong codes. Wait 15 minutes or ask the head judge.',
  unknown_judge: 'That head judge isn’t active any more. Ask the organiser.',
  bad_name: 'Type your first and last name.',
  head_name: 'That’s a head judge’s name. Use “Head judge sign in” below.',
  head_code: 'That’s a head judge code. Use “Head judge sign in” below.',
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

  // head judges: the head code says which event, then they pick their name from its head judges
  const [heads, setHeads] = useState<{ event: { name: string }; judges: { id: string; name: string }[] } | null>(null)
  const [headId, setHeadId] = useState<string | null>(null)
  const head = heads?.judges.find((j) => j.id === headId)

  useEffect(() => {
    try { setName(localStorage.getItem(LAST_NAME) ?? '') } catch { /* private mode */ }
  }, [])
  function switchMode(m: 'lane' | 'head') { setMode(m); setCode(''); setError(''); setHeadId(null); setHeads(null) }

  async function checkHeadCode(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 4) return
    setBusy(true)
    setError('')
    const res = await headsForCode(code)
    setBusy(false)
    if ('error' in res) { setError(ERRORS[res.error] ?? 'Something went wrong. Try again.'); setCode('') }
    else setHeads(res)
  }

  async function pickHead(id: string) {
    setHeadId(id)
    setBusy(true)
    setError('')
    const res = await login(id, code)
    setBusy(false)
    if ('error' in res) { setError(ERRORS[res.error] ?? 'Something went wrong. Try again.'); setHeadId(null) }
    else onSignedIn()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 4) return
    setBusy(true)
    setError('')
    const res = await register(name, code)
    setBusy(false)
    if ('error' in res) { setError(ERRORS[res.error] ?? 'Something went wrong. Try again.'); if (res.error !== 'bad_name' && res.error !== 'head_name') setCode('') }
    else {
      try { localStorage.setItem(LAST_NAME, name.trim()) } catch { /* ignore */ }
      onSignedIn()
    }
  }

  if (mode === 'head') {
    return (
      <div className="j-signin">
        <div className="j-signin-logo"><Logo width={150} variant="stacked" /></div>
        <div className="j-signin-head">
          <h1>{head ? `Hi ${head.name.split(' ')[0]}` : 'Head judge sign in'}</h1>
          <p className="j-note">{heads ? <>Judging <b>{heads.event.name}</b>. Pick your name.</> : 'Enter the 4-digit head judge code.'}</p>
        </div>
        {!heads ? (
          <form onSubmit={checkHeadCode} className="j-signin-form">
            <label><span className="j-label">Head judge code</span><CodeInput code={code} setCode={setCode} autoFocus /></label>
            {error && <div className="j-banner bad">{error}</div>}
            <button className="j-primary" disabled={busy || code.length !== 4}>{busy ? 'Checking…' : 'Next'}</button>
          </form>
        ) : (
          <>
            <div className="j-group">
              {heads.judges.length === 0 && <p className="j-note" style={{ padding: 16 }}>No head judges have been set up for this event. Add them in Admin → Judges.</p>}
              {heads.judges.map((j) => (
                <button key={j.id} type="button" className="j-name" disabled={busy} onClick={() => void pickHead(j.id)}>
                  <span>{j.name}</span>
                  <span className="chev" aria-hidden>{busy && headId === j.id ? '…' : '›'}</span>
                </button>
              ))}
            </div>
            {error && <div className="j-banner bad">{error}</div>}
          </>
        )}
        <button type="button" className="j-tool" style={{ justifySelf: 'center' }} onClick={() => (heads ? (setHeads(null), setCode(''), setError('')) : switchMode('lane'))}>
          {heads ? 'Use a different code' : '‹ Back to judge sign in'}
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
