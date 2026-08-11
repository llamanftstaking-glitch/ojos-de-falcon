import type { LngLat } from './geo'
import { queryNearby } from './locations'
import { FACILITY_PRIORITY, type SafetyCategory } from './categories'
import type { SafeDestinationCandidate, SafetyLocation } from './types'

/**
 * Safe Destination Engine — "Take me somewhere safe."
 *
 * Chooses the safest *practical* destination, not the geographically
 * closest point. Scoring combines travel time, facility priority,
 * open/24h status, and verification confidence, with penalties for
 * closed or unverifiable facilities.
 *
 * Lives here as a dedicated service — never hardcode ranking rules in UI.
 */

const DEFAULT_CATEGORIES: SafetyCategory[] = [
  'police',
  'fire_station',
  'hospital',
  'emergency_room',
  'sheriff',
  'state_police',
  'shelter',
  'safe_place',
]

export interface SafeDestinationQuery {
  center: LngLat
  categories?: SafetyCategory[]
  limit?: number
}

export function rankSafeDestinations(query: SafeDestinationQuery): SafeDestinationCandidate[] {
  const limit = Math.min(Math.max(query.limit ?? 5, 1), 20)
  const nearby = queryNearby({
    center: query.center,
    categories: query.categories ?? DEFAULT_CATEGORIES,
    radiusMeters: 10_000,
    limit: 60,
  })

  const candidates = nearby.map(({ location, distanceMeters, etaMinutes }) => {
    const reasons: string[] = []

    const priority = FACILITY_PRIORITY[location.category] ?? 0.3
    // Travel time dominates: a facility 3 minutes away beats a marginally
    // "better" one 20 minutes away.
    const travelScore = 1 / (1 + etaMinutes / 6)

    const openScore = openStatusScore(location, reasons)
    const verificationScore = verificationConfidence(location, reasons)

    if (etaMinutes <= 5) reasons.push('Close by')
    if (location.category === 'police') reasons.push('Police facility')
    if (location.category === 'emergency_room' || location.category === 'hospital')
      reasons.push('Emergency medical care')
    if (location.category === 'fire_station') reasons.push('Staffed fire station')

    const score = travelScore * priority * openScore * verificationScore

    return { location, distanceMeters, etaMinutes, score, reasons }
  })

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit)
}

function openStatusScore(location: SafetyLocation, reasons: string[]): number {
  if (location.verification === 'temporarily_closed') {
    reasons.push('May be temporarily closed')
    return 0.15
  }
  if (location.is24Hours === true) {
    reasons.push('Open 24 hours')
    return 1.0
  }
  if (location.is24Hours === false) return 0.7
  // Unknown hours: don't claim it's open; modest confidence for facility
  // types that are typically staffed around the clock.
  const typically24h =
    location.category === 'police' ||
    location.category === 'emergency_room' ||
    location.category === 'hospital' ||
    location.category === 'fire_station'
  return typically24h ? 0.85 : 0.6
}

function verificationConfidence(location: SafetyLocation, reasons: string[]): number {
  switch (location.verification) {
    case 'verified_official':
      reasons.push('Officially verified')
      return 1.0
    case 'verified_community':
      reasons.push('Community verified')
      return 0.9
    case 'needs_review':
      return 0.6
    case 'unverified':
    default:
      return 0.75
  }
}
