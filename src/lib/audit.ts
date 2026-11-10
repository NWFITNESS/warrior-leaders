import type { SupabaseClient } from '@supabase/supabase-js'

export async function audit(
  supabase: SupabaseClient,
  entry: { competition_id: string; actor: string; action: string; entity: string; entity_id?: string; before?: unknown; after?: unknown; reason?: string }
) {
  await supabase.from('wl_audit_log').insert({
    competition_id: entry.competition_id,
    actor: entry.actor,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entity_id ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  })
}
