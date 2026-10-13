import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import type { Workout } from '@/lib/types'
import { Builder } from './builder'

export const metadata = { title: 'Workout builder' }

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await requireStaff()
  const { data: workout } = await supabase
    .from('wl_workouts')
    .select('*, workout_parts:wl_workout_parts(*, part_movements:wl_part_movements(*))')
    .eq('id', id)
    .maybeSingle<Workout>()
  if (!workout) notFound()
  return <Builder workout={workout} />
}
