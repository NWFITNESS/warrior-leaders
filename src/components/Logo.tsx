/* eslint-disable @next/next/no-img-element */

// Northern Warrior Competitions logo (white + gold, transparent background). Width drives the size.
// Full-size transparent master: public/nw-competitions-logo-transparent.png
export function Logo({ width = 220, className }: { width?: number; className?: string }) {
  return (
    <img
      src="/nw-competitions-logo-900.png"
      alt="Northern Warrior Competitions"
      width={width}
      height={Math.round(width * (832 / 1472))}
      className={className}
      style={{ display: 'block', width, maxWidth: '100%', height: 'auto' }}
    />
  )
}
