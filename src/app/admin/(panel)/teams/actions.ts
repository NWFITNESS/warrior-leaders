'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'
import type { ImportRow } from '@/lib/csv'

export interface TeamInput {
  id?: string
  name: string
  division_id: string
  bib: number | null
  notes: string | null
  athletes: { id?: string; first_name: string; last_name: string; email: string | null; phone: string | null; is_captain: boolean }[]
}

export async function saveTeam(input: TeamInput): Promise<{ error?: string }> {
  const { supabase, actor } = await requireStaff()
  const name = input.name.trim()
  if (!name) return { error: 'Give the team a name.' }
  const athletes = input.athletes.filter((a) => a.first_name.trim())
  if (athletes.length === 0) return { error: 'Add at least one athlete.' }

  const teamRow = { name, division_id: input.division_id, bib: input.bib, notes: input.notes || null }
  let teamId = input.id
  if (teamId) {
    const { error } = await supabase.from('wl_teams').update(teamRow).eq('id', teamId)
    if (error) return { error: friendly(error.message) }
  } else {
    const { data, error } = await supabase.from('wl_teams').insert(teamRow).select('id').single()
    if (error) return { error: friendly(error.message) }
    teamId = data.id
  }

  // Replace the athlete list (keeps ids for athletes that stayed).
  const keepIds = athletes.filter((a) => a.id).map((a) => a.id!)
  const del = supabase.from('wl_athletes').delete().eq('team_id', teamId)
  await (keepIds.length ? del.not('id', 'in', `(${keepIds.join(',')})`) : del)
  const rows = athletes.map((a, i) => ({
    ...(a.id ? { id: a.id } : {}),
    team_id: teamId,
    position: i + 1,
    first_name: a.first_name.trim(),
    last_name: a.last_name.trim(),
    email: a.email?.trim() || null,
    phone: a.phone?.trim() || null,
    is_captain: a.is_captain,
  }))
  const { error: aErr } = await supabase.from('wl_athletes').upsert(rows)
  if (aErr) return { error: aErr.message }

  await audit(supabase, { actor, action: input.id ? 'team.update' : 'team.create', entity: 'team', entity_id: teamId, after: { ...teamRow, athletes: rows.length } })
  revalidatePath('/admin/teams')
  redirect('/admin/teams')
}

export async function deleteTeam(id: string) {
  const { supabase, actor } = await requireStaff()
  const { data: before } = await supabase.from('wl_teams').select('*, athletes:wl_athletes(*)').eq('id', id).single()
  await supabase.from('wl_teams').delete().eq('id', id)
  await audit(supabase, { actor, action: 'team.delete', entity: 'team', entity_id: id, before })
  revalidatePath('/admin/teams')
  redirect('/admin/teams')
}

export async function importTeams(rows: ImportRow[], mode: 'skip' | 'update'): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
  const { supabase, actor } = await requireStaff()
  const { data: divisions } = await supabase.from('wl_divisions').select('id, name')
  const { data: existing } = await supabase.from('wl_teams').select('id, name, division_id')
  const divByName = new Map((divisions ?? []).map((d) => [d.name.toLowerCase().replace(/\s+/g, ' '), d.id]))
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] }

  for (const r of rows) {
    if (r.error) { result.errors.push(`Line ${r.line}: ${r.error}`); continue }
    const divId = divByName.get(r.division.toLowerCase().replace(/\s+/g, ' '))
    if (!divId) { result.errors.push(`Line ${r.line}: unknown division “${r.division}”`); continue }

    const match = existing?.find((t) => t.division_id === divId && t.name.toLowerCase() === r.team_name.toLowerCase())
    if (match && mode === 'skip') { result.skipped++; continue }

    let teamId = match?.id
    if (match) {
      await supabase.from('wl_teams').update({ bib: r.bib, notes: r.notes }).eq('id', match.id)
      await supabase.from('wl_athletes').delete().eq('team_id', match.id)
      result.updated++
    } else {
      const { data, error } = await supabase.from('wl_teams').insert({ name: r.team_name, division_id: divId, bib: r.bib, notes: r.notes }).select('id').single()
      if (error) { result.errors.push(`Line ${r.line}: ${friendly(error.message)}`); continue }
      teamId = data.id
      result.created++
    }
    await supabase.from('wl_athletes').insert(
      r.athletes.map((a, i) => ({ ...a, team_id: teamId, position: i + 1, is_captain: i === 0 }))
    )
  }

  await audit(supabase, { actor, action: 'team.import', entity: 'team', after: { ...result, errors: result.errors.length } })
  revalidatePath('/admin/teams')
  return result
}

function friendly(msg: string) {
  return msg.includes('duplicate key') ? 'A team with that name already exists in this division.' : msg
}
