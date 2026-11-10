import { redirect } from 'next/navigation'
import { currentEventBase } from '@/lib/public-event'

export const dynamic = 'force-dynamic'

// Old address: the current event's /live (query string kept, e.g. /live?view=race)
export default async function Old({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v != null ? [[k, v]] : [])))
  redirect(`${await currentEventBase()}/live${q.size ? `?${q}` : ''}`)
}
