'use client'
// Judge app data layer. Judges have no Supabase account: they hold a session token from
// wl_judge_login and every call goes through the wl_judge_* functions with the anon key.
// Everything a judge does is written to this phone first (drafts + an outbox), then synced,
// so scoring carries on through Wi-Fi drop-outs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { WorkoutPart } from './types'
import type { Entries } from './scoring'

let client: SupabaseClient | null = null
function db() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

// ── Types returned by wl_judge_assignments ─────────────────────────────────────
export interface JudgeAthlete { id: string; first_name: string; last_name: string; is_captain: boolean }
export interface JudgePart extends WorkoutPart { id: string }
export interface ServerScore { part_id: string; status: 'draft' | 'submitted' | 'verified' | 'appeal' | 'rejected'; value: number | null; capped: boolean; entries: Entries | Record<string, never>; signed_by: string | null; updated_at: string }
export interface Lane {
  lane_assignment_id: string
  heat_id: string
  heat_number: number
  start_time: string | null
  lane: number
  judge_name: string | null
  workout: { id: string; number: number; name: string; description: string | null; status: string }
  team: { id: string; name: string; division: string; level: 'rx' | 'scaled'; sex: 'male' | 'female' | 'mixed'; athletes: JudgeAthlete[] }
  parts: JudgePart[]
  scores: ServerScore[]
}
export interface Assignments { judge: { id: string; name: string; role: 'head' | 'lane' }; lanes: Lane[] }

// ── Safe localStorage ──────────────────────────────────────────────────────────
function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full or blocked: syncing still works */ }
}
function remove(key: string) { try { localStorage.removeItem(key) } catch { /* ignore */ } }

const TOKEN = 'wl-judge-token'
const CACHE = 'wl-judge-assignments'
const OUTBOX = 'wl-judge-outbox'
const draftKey = (lane: string, part: string) => `wl-draft:${lane}:${part}`

export const getToken = () => read<string | null>(TOKEN, null)
export const getCachedAssignments = () => read<Assignments | null>(CACHE, null)

// ── Sign-in ────────────────────────────────────────────────────────────────────
export async function listJudges(): Promise<{ id: string; name: string; role: string }[]> {
  const { data, error } = await db().rpc('wl_judge_list')
  if (error) throw error
  return data ?? []
}

export async function login(judgeId: string, code: string): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await db().rpc('wl_judge_login', { p_judge: judgeId, p_code: code })
  if (error) return { error: 'offline' }
  if (data?.error) return { error: data.error }
  write(TOKEN, data.token)
  return { ok: true }
}

export async function logout() {
  const token = getToken()
  remove(TOKEN)
  remove(CACHE)
  if (token) await db().rpc('wl_judge_logout', { p_token: token }).then(() => {}, () => {})
}

export async function fetchAssignments(): Promise<Assignments | { error: 'signed_out' | 'offline' }> {
  const token = getToken()
  if (!token) return { error: 'signed_out' }
  const { data, error } = await db().rpc('wl_judge_assignments', { p_token: token })
  if (error) return { error: 'offline' }
  if (data?.error === 'signed_out') { remove(TOKEN); return { error: 'signed_out' } }
  write(CACHE, data)
  return data as Assignments
}

// ── Drafts (this phone's copy of each score) ───────────────────────────────────
export interface Draft { entries: Entries; tiebreak: string; signed_by: string; status: 'draft' | 'submitted'; updatedAt: number; locked?: string }
export const getDraft = (lane: string, part: string) => read<Draft | null>(draftKey(lane, part), null)
export const putDraft = (lane: string, part: string, d: Draft) => write(draftKey(lane, part), d)

// ── Outbox + sync ──────────────────────────────────────────────────────────────
export interface JudgeEvent { kind: string; payload: Record<string, unknown>; at: string }
interface Pending {
  lane: string
  part: string
  score: { status: 'draft' | 'submitted'; value: number | null; capped: boolean; reps: number | null; rounds: number | null; tiebreak_value: number | null; entries: Entries; splits: unknown[]; signed_by: string | null }
  events: JudgeEvent[]
}

type Listener = () => void
const listeners = new Set<Listener>()
export function onSyncChange(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn) } }
const notify = () => listeners.forEach((fn) => fn())

let lastSyncError: string | null = null
let syncing = false
export function syncState() {
  const box = read<Record<string, Pending>>(OUTBOX, {})
  return { pending: Object.keys(box).length, syncing, error: lastSyncError }
}

export function queue(item: Pending) {
  const box = read<Record<string, Pending>>(OUTBOX, {})
  const key = `${item.lane}:${item.part}`
  const prev = box[key]
  // keep the latest score, but never drop time-stamped events that haven't been sent yet
  box[key] = { ...item, events: [...(prev?.events ?? []), ...item.events] }
  write(OUTBOX, box)
  notify()
  void flush()
}

export async function flush(): Promise<'ok' | 'offline' | 'signed_out'> {
  if (syncing) return 'ok'
  const token = getToken()
  if (!token) return 'signed_out'
  syncing = true
  notify()
  try {
    const box = read<Record<string, Pending>>(OUTBOX, {})
    for (const [key, item] of Object.entries(box)) {
      const { data, error } = await db().rpc('wl_judge_save_score', {
        p_token: token, p_lane_assignment: item.lane, p_part: item.part, p_score: { ...item.score, events: item.events },
      })
      if (error) { lastSyncError = 'offline'; return 'offline' }
      if (data?.error === 'signed_out') { lastSyncError = 'signed_out'; return 'signed_out' }
      if (data?.error === 'locked') {
        const d = getDraft(item.lane, item.part)
        if (d) putDraft(item.lane, item.part, { ...d, locked: data.status })
      } else if (data?.error) {
        lastSyncError = data.error
      }
      // sent (or permanently refused): drop it. If a newer save arrived while this one was in
      // flight, keep that newer score but strip the events we just sent (they were appended in order).
      const latest = read<Record<string, Pending>>(OUTBOX, {})
      if (latest[key]) {
        if (JSON.stringify(latest[key]) === JSON.stringify(item)) delete latest[key]
        else latest[key] = { ...latest[key], events: latest[key].events.slice(item.events.length) }
        write(OUTBOX, latest)
      }
    }
    lastSyncError = null
    return 'ok'
  } finally {
    syncing = false
    notify()
  }
}

export function startSyncLoop() {
  const tick = () => { if (navigator.onLine) void flush() }
  const id = window.setInterval(tick, 5000)
  window.addEventListener('online', tick)
  return () => { window.clearInterval(id); window.removeEventListener('online', tick) }
}
