import { createClient } from '@/lib/supabase/server'

/**
 * Returns a Supabase client bound to the signed-in staff member, plus their email.
 * Throws if there is no session — use at the top of every admin server action.
 */
export async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  return { supabase, actor: user.email ?? user.id }
}
