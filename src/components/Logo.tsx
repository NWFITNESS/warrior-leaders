/* eslint-disable @next/next/no-img-element */

// Warrior Leaders logo (Sprint WL), white + gold for the site's dark background.
// Masters + guidelines: brand/logo/kit (GUIDELINES.md). Web copies are cropped tight: public/brand/.
//   horizontal  mark + WARRIOR / LEADERS (default)
//   stacked     mark over the name: sign-in screens
//   mark        WL only: small headers (uses the small-size cut, wider W–L gap, when under 64 px wide)
const VARIANTS = {
  horizontal: { src: '/brand/logo-horizontal.svg', ratio: 784.8 / 160 },
  stacked: { src: '/brand/logo-stacked.svg', ratio: 377.51 / 329.4 },
  mark: { src: '/brand/mark.svg', ratio: 253.04 / 160 },
} as const

export function Logo({ width = 220, variant = 'horizontal', className }: { width?: number; variant?: keyof typeof VARIANTS; className?: string }) {
  const v = VARIANTS[variant]
  const src = variant === 'mark' && width < 64 ? '/brand/mark-small.svg' : v.src
  return (
    <img
      src={src}
      alt="Warrior Leaders"
      width={width}
      height={Math.round(width / v.ratio)}
      className={className}
      style={{ display: 'block', width, maxWidth: '100%', height: 'auto' }}
    />
  )
}
