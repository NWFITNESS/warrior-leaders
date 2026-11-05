import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  // email attachments go through a server action (8 MB of files ≈ 11 MB once encoded)
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      // The admin should never be framed; the public leaderboard may be shown on a TV via a browser.
      { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
    ]
  },
}

export default nextConfig
