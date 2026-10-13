'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { audit } from '@/lib/audit'

export async function saveJudge(formData: FormData) {
  const { supabase, actor } = await requireStaff()
  const id = String(formData.get('id') ?? '')
  const row = {
    name: String(formData.get('name') ?? '').trim(),
    role: formData.get('role') === 'head' ? 'head' : 'lane',
    phone: String(formData.get('phone') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    active: formData.get('active') !== 'off',
  }
  if (!row.name) return
  if (id) await supabase.from('judges').update(row).eq('id', id)
  else await supabase.from('judges').insert(row)
  await audit(supabase, { actor, action: id ? 'judge.update' : 'judge.create', entity: 'judge', entity_id: id || undefined, after: row })
  revalidatePath('/admin/judges')
}

export async function toggleJudge(id: string, active: boolean) {
  const { supabase, actor } = await requireStaff()
  await supabase.from('judges').update({ active }).eq('id', id)
  await audit(supabase, { actor, action: active ? 'judge.activate' : 'judge.deactivate', entity: 'judge', entity_id: id })
  revalidatePath('/admin/judges')
}

export async function deleteJudge(id: string) {
  const { supabase, actor } = await requireStaff()
  await supabase.from('judges').delete().eq('id', id)
  await audit(supabase, { actor, action: 'judge.delete', entity: 'judge', entity_id: id })
  revalidatePath('/admin/judges')
}
