import type { PointsMethod } from './types'

/** Points awarded for a finishing place (1-based) under the chosen method. */
export function pointsFor(method: PointsMethod, place: number, divisionSize: number, custom: number[] = []) {
  if (method === 'placing') return place
  if (method === 'reverse') return Math.max(1, divisionSize - place + 1)
  return custom[place - 1] ?? 0
}

/** Placing points: lowest total wins. Reverse and custom: highest total wins. */
export function lowerTotalWins(method: PointsMethod) {
  return method === 'placing'
}
