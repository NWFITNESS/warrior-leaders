/* eslint-disable @next/next/no-img-element */

// Northern Warrior Competitions logo (white + gold on black). Width drives the size.
export function Logo({ width = 220, className }: { width?: number; className?: string }) {
  return (
    <img
      src="/nw-competitions-logo-900.png"
      alt="Northern Warrior Competitions"
      width={width}
      height={Math.round(width * (832 / 1472))}
      className={className}
      // lighten blend drops the logo's black box into the page background
      style={{ display: 'block', width, maxWidth: '100%', height: 'auto', mixBlendMode: 'lighten' }}
    />
  )
}
