'use client'

import { useActionState, useState } from 'react'
import { createEvent } from './actions'

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export function NewEventForm({ events }: { events: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createEvent, {})
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [touched, setTouched] = useState(false)
  const [copyFrom, setCopyFrom] = useState(events[0]?.id ?? '')
  return (
    <form action={action} className="card stack">
      <h2>New event</h2>
      <label className="field">
        <span>Event name</span>
        <input name="name" className="input" required value={name} placeholder="e.g. Summer Throwdown 2027"
          onChange={(e) => { setName(e.target.value); if (!touched) setSlug(slugify(e.target.value)) }} />
      </label>
      <div className="grid-3">
        <label className="field"><span>Start date</span><input name="start_date" type="date" className="input" required /></label>
        <label className="field"><span>End date (blank = one day)</span><input name="end_date" type="date" className="input" /></label>
        <label className="field"><span>Venue</span><input name="venue" className="input" placeholder="Same as the copied event" /></label>
      </div>
      <label className="field">
        <span>Web address</span>
        <input name="slug" className="input mono" required value={slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(e) => { setTouched(true); setSlug(e.target.value) }} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Start from</span>
          <select name="copy_from" className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">A blank event</option>
            {events.map((e) => <option key={e.id} value={e.id}>A copy of {e.name}</option>)}
          </select>
        </label>
        {copyFrom && (
          <div className="stack-sm">
            <span className="small muted">Copy across</span>
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" name="copy_divisions" defaultChecked /> Divisions</label>
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" name="copy_workouts" defaultChecked /> Workouts, movements and standards (as drafts)</label>
            <span className="small subtle">Points method, lanes and the big-screen slides come across too. Teams, judges, heats and scores never do. New judge codes are made.</span>
          </div>
        )}
      </div>
      {state.error && <p className="notice notice-bad">{state.error}</p>}
      <div><button className="btn" disabled={pending}>{pending ? 'Creating…' : 'Create event'}</button></div>
    </form>
  )
}
