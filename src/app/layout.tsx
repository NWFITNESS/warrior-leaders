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
  metadataBase: new URL('https://leaders.northernwarrior.co.uk'),
  title: { default: 'Warrior Leaders', template: '%s · Warrior Leaders' },
  description: 'Live leaderboard for Warrior Leaders by Northern Warrior Competitions.',
  icons: {
    icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
  openGraph: { images: [{ url: '/brand/og.png', width: 1200, height: 630 }] },
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
