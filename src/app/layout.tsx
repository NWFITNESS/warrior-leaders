import type { Metadata, Viewport } from 'next'
import { Inter, Rajdhani } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const rajdhani = Rajdhani({ subsets: ['latin'], variable: '--font-rajdhani', weight: ['500', '600', '700'] })

export const metadata: Metadata = {
  title: { default: 'The Warrior Leaders', template: '%s · The Warrior Leaders' },
  description: 'Live leaderboard for The Warrior Leaders competition at Northern Warrior.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className={`${inter.variable} ${rajdhani.variable}`}>{children}</body>
    </html>
  )
}
