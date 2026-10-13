import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Public pages read through SECURITY DEFINER functions that return only
// non-sensitive columns (no emails or phone numbers). Uses the anon key —
// no service-role key is needed anywhere in this app.
function anon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function getPublicSettings() {
  const { data } = await anon().rpc('wl_public_settings')
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
  const { data } = await anon().rpc('wl_public_teams')
  const result = (data ?? { divisions: [], teams: [] }) as { divisions: { id: string; name: string }[]; teams: PublicTeam[] }
  return result
}
