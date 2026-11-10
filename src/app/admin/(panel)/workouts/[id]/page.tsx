import { notFound } from 'next/navigation'
import { requireEvent } from '@/lib/event'
import type { Workout } from '@/lib/types'
import { Builder } from './builder'

export const metadata = { title: 'Workout builder' }

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, event } = await requireEvent()
  const { data: workout } = await supabase
    .from('wl_workouts')
    .select('*, workout_parts:wl_workout_parts(*, part_movements:wl_part_movements!wl_part_movements_part_id_fkey(*))').eq('competition_id', event.id)
    .eq('id', id)
    .maybeSingle<Workout>()
  if (!workout) notFound()
  return <Builder workout={workout} />
}
