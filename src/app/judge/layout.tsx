import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Judge',
  robots: { index: false },
  appleWebApp: { capable: true, title: 'WL Judge', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // no accidental pinch-zoom while tapping ticks
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
}

export default function JudgeLayout({ children }: { children: React.ReactNode }) {
  return children
}
