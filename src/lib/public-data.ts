import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Public pages read with the service role on the server and select only
// non-sensitive columns (no emails or phone numbers ever leave this file).

export async function getPublicSettings() {
  const db = createAdminClient()
  const { data } = await db.from('competition_settings').select('name, event_date, venue').single()
  return data as { name: string; event_date: string; venue: string } | null
}

export interface PublicTeam {
  id: string
  name: string
  bib: number | null
  division_id: string
  athletes: { first_name: string; last_name: string; position: number }[]
}

export async function getPublicTeams() {
  const db = createAdminClient()
  const [{ data: divisions }, { data: teams }] = await Promise.all([
    db.from('divisions').select('id, name, sort_order').order('sort_order'),
    db.from('teams').select('id, name, bib, division_id, athletes(first_name, last_name, position)').order('name'),
  ])
  return {
    divisions: (divisions ?? []) as { id: string; name: string }[],
    teams: (teams ?? []) as PublicTeam[],
  }
}
