import { TEMPLATE_CSV } from '@/lib/csv'

export function GET() {
  return new Response(TEMPLATE_CSV, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="warrior-leaders-teams-template.csv"',
    },
  })
}
