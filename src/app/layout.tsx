import type { Metadata, Viewport } from 'next'
import { League_Spartan } from 'next/font/google'
import './globals.css'

// Northern Warrior brand font — same as the website and the competitions logo.
const leagueSpartan = League_Spartan({
  subsets: ['latin'],
  variable: '--font-league-spartan',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'The Warrior Leaders', template: '%s · The Warrior Leaders' },
  description: 'Live leaderboard for The Warrior Leaders competition by Northern Warrior Competitions.',
  icons: {
    icon: [{ url: '/icon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icon-256.png', sizes: '256x256', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
  openGraph: { images: ['/nw-competitions-logo-900.png'] },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Font variable must sit on <html>: globals.css reads it from :root.
    <html lang="en-GB" className={leagueSpartan.variable}>
      <body>{children}</body>
    </html>
  )
}
