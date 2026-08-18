import type { LngLat } from '../geo'
import type { Maneuver, Route, RouteStep, RoutingProvider, TravelProfile } from './types'

/**
 * Google Routes API adapter (Routes API v2). Active when
 * GOOGLE_MAPS_API_KEY is set — the key stays server-side; the browser
 * never sees it. Requires "Routes API" enabled on the key's project.
 */
const API_KEY = process.env.GOOGLE_MAPS_API_KEY || ''
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'

const TRAVEL_MODE: Record<TravelProfile, string> = {
  driving: 'DRIVE',
  walking: 'WALK',
}

const GOOGLE_MANEUVERS: Record<string, Maneuver> = {
  DEPART: 'depart',
  STRAIGHT: 'straight',
  NAME_CHANGE: 'straight',
  TURN_LEFT: 'turn-left',
  TURN_RIGHT: 'turn-right',
  TURN_SLIGHT_LEFT: 'slight-left',
  TURN_SLIGHT_RIGHT: 'slight-right',
  TURN_SHARP_LEFT: 'sharp-left',
  TURN_SHARP_RIGHT: 'sharp-right',
  UTURN_LEFT: 'uturn',
  UTURN_RIGHT: 'uturn',
  MERGE: 'merge',
  FORK_LEFT: 'fork-left',
  FORK_RIGHT: 'fork-right',
  RAMP_LEFT: 'ramp-left',
  RAMP_RIGHT: 'ramp-right',
  ON_RAMP_LEFT: 'ramp-left',
  ON_RAMP_RIGHT: 'ramp-right',
  OFF_RAMP_LEFT: 'ramp-left',
  OFF_RAMP_RIGHT: 'ramp-right',
  ROUNDABOUT_LEFT: 'roundabout',
  ROUNDABOUT_RIGHT: 'roundabout',
  DESTINATION: 'arrive',
  DESTINATION_LEFT: 'arrive',
  DESTINATION_RIGHT: 'arrive',
}

function normalizeGoogleManeuver(m?: string): Maneuver | undefined {
  return m ? GOOGLE_MANEUVERS[m] : undefined
}

export class GoogleRoutesProvider implements RoutingProvider {
  readonly name = 'google'

  isConfigured(): boolean {
    return API_KEY.length > 0
  }

  async route(from: LngLat, to: LngLat, profile: TravelProfile): Promise<Route | null> {
    if (!this.isConfigured()) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(ROUTES_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask':
            'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from[1], longitude: from[0] } } },
          destination: { location: { latLng: { latitude: to[1], longitude: to[0] } } },
          travelMode: TRAVEL_MODE[profile],
          polylineQuality: 'HIGH_QUALITY',
        }),
      })
      if (!res.ok) {
        console.error('[routing/google] HTTP', res.status, await res.text().catch(() => ''))
        return null
      }
      const data = await res.json()
      const r = data.routes?.[0]
      if (!r?.polyline?.encodedPolyline) return null

      const geometry = decodePolyline(r.polyline.encodedPolyline)
      const steps: RouteStep[] = []
      for (const leg of r.legs ?? []) {
        for (const step of leg.steps ?? []) {
          steps.push({
            instruction: step.navigationInstruction?.instructions ?? 'Continue',
            distanceMeters: step.distanceMeters ?? 0,
            durationSeconds: parseDuration(step.staticDuration),
            geometryIndex: 0, // Google steps don't map 1:1 onto polyline indices
            maneuver: normalizeGoogleManeuver(step.navigationInstruction?.maneuver),
          })
        }
      }
      return {
        geometry,
        distanceMeters: r.distanceMeters ?? 0,
        durationSeconds: parseDuration(r.duration),
        steps,
        provider: this.name,
        approximate: false,
      }
    } catch (err) {
      console.error('[routing/google]', err)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

/** "1234s" → 1234 */
function parseDuration(raw: unknown): number {
  if (typeof raw !== 'string') return 0
  const n = Number(raw.replace(/s$/, ''))
  return Number.isFinite(n) ? n : 0
}

/** Standard Google encoded-polyline decoder → [lng, lat] pairs. */
export function decodePolyline(encoded: string): LngLat[] {
  const points: LngLat[] = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    for (const which of [0, 1] as const) {
      let result = 0
      let shift = 0
      let byte: number
      do {
        byte = encoded.charCodeAt(index++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (which === 0) lat += delta
      else lng += delta
    }
    points.push([lng / 1e5, lat / 1e5])
  }
  return points
}
