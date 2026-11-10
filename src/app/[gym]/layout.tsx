export async function generateStaticParams() {
  return [] as { gym: string }[]
}

export default function GymLayout({ children }: { children: React.ReactNode }) {
  return children
}
