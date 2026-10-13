'use client'

import { useActionState } from 'react'
import { signIn } from './actions'
import { Logo } from '@/components/Logo'

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, { error: '' })

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form action={action} className="card stack" style={{ width: '100%', maxWidth: 380, padding: 28 }}>
        <div className="stack-sm" style={{ justifyItems: 'center', textAlign: 'center' }}>
          <Logo width={260} />
          <span className="eyebrow" style={{ marginTop: 6 }}>The Warrior Leaders</span>
          <h1 style={{ fontSize: '1.7rem' }}>Admin sign in</h1>
          <p className="muted small">Sign in with your NWHub staff login.</p>
        </div>
        <label className="field">
          <span>Email</span>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </label>
        <label className="field">
          <span>Password</span>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </label>
        {state.error && <p className="notice notice-bad">{state.error}</p>}
        <button className="btn" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}
