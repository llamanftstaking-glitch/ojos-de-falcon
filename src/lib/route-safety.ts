import type { LngLat } from './geo'
import {
  lineBBox,
  nearestPointOnLine,
  lineLengthMeters,
  estimateDriveMinutes,
} from './geo'
import { queryByBBox } from './locations'
import type { SafetyCategory } from './categories'
import { FACILITY_PRIORITY } from './categories'
import type { RouteSafetyResult } from './types'

export interface RouteSafetyInput {
  /** Route geometry as [lng, lat] pairs. */
  geometry: LngLat[]
  /** Traveler's progress along the route in meters (0 = at start). */
  progressMeters?: number
  /** Total route duration in seconds (used to convert distance → minutes). */
  durationSeconds?: number
  categories?: SafetyCategory[]
  /** Max perpendicular distance from the route to include (meters). */
  corridorMeters?: number
  limit?: number
}

/**
 * Route Safety Engine: safety facilities within a corridor of the active
 * route, ranked by usefulness to the traveler — forward of their position,
 * close to the roadway, high-priority facility types first.
 */
export function analyzeRouteSafety(input: RouteSafetyInput): RouteSafetyResult[] {
  const { geometry } = input
  if (!geometry || geometry.length < 2) return []

  const corridor = Math.min(Math.max(input.corridorMeters ?? 1200, 100), 10_000)
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100)
  const progress = Math.max(0, input.progressMeters ?? 0)
  const routeLength = lineLengthMeters(geometry)

  // Average speed along this route (m/s) for distance → minutes conversion.
  const avgSpeed =
    input.durationSeconds && input.durationSeconds > 0
      ? routeLength / input.durationSeconds
      : 8.9

  const candidates = queryByBBox({
    bbox: lineBBox(geometry, corridor),
    categories: input.categories,
    limit: 2000,
  })

  const results: RouteSafetyResult[] = []
  for (const location of candidates) {
    const point: LngLat = [location.longitude, location.latitude]
    const nearest = nearestPointOnLine(point, geometry)
    if (nearest.distanceMeters > corridor) continue

    const distanceAhead = nearest.alongMeters - progress
    const minutesAhead = Math.max(0, Math.round(distanceAhead / avgSpeed / 60))
    // Detour: leave the route, reach the facility, come back — twice the
    // perpendicular distance at conservative urban speed.
    const detourMinutes = estimateDriveMinutes(nearest.distanceMeters * 2)

    results.push({
      location,
      distanceFromRouteMeters: Math.round(nearest.distanceMeters),
      distanceAheadMeters: Math.round(distanceAhead),
      minutesAhead,
      detourMinutes,
    })
  }

  return results
    .sort((a, b) => scoreResult(b) - scoreResult(a))
    .slice(0, limit)
}

/**
 * Usefulness score, not straight-line distance: forward locations beat
 * behind, small detours beat large ones, tier-1 facilities beat tier-3.
 */
function scoreResult(r: RouteSafetyResult): number {
  const priority = FACILITY_PRIORITY[r.location.category] ?? 0.3
  const behindPenalty = r.distanceAheadMeters < 0 ? 0.35 : 1
  const detourPenalty = 1 / (1 + r.detourMinutes / 5)
  const proximity = 1 / (1 + Math.abs(r.distanceAheadMeters) / 4000)
  return priority * behindPenalty * detourPenalty * (0.5 + 0.5 * proximity)
}

export interface RouteSafetySummary {
  policeCount: number
  fireCount: number
  medicalCount: number
  courtCount: number
  total: number
}

export function summarizeRouteSafety(results: RouteSafetyResult[]): RouteSafetySummary {
  const summary: RouteSafetySummary = {
    policeCount: 0,
    fireCount: 0,
    medicalCount: 0,
    courtCount: 0,
    total: results.length,
  }
  for (const r of results) {
    switch (r.location.category) {
      case 'police':
      case 'sheriff':
      case 'state_police':
        summary.policeCount++
        break
      case 'fire_station':
        summary.fireCount++
        break
      case 'hospital':
      case 'emergency_room':
      case 'ems':
      case 'urgent_care':
        summary.medicalCount++
        break
      case 'courthouse':
        summary.courtCount++
        break
    }
  }
  return summary
}
