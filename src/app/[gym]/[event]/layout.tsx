// Event pages are built on first visit and then cached for their `revalidate` time (no list of events at build time).
export async function generateStaticParams() {
  return [] as { gym: string; event: string }[]
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return children
}
