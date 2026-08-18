import type { LngLat } from '../geo'
import type { Maneuver, Route, RouteStep, RoutingProvider, TravelProfile } from './types'

/**
 * OSRM adapter. Defaults to the public demo server, which is fine for
 * development but rate-limited and unsuitable for production traffic —
 * point OSRM_URL at a self-hosted OSRM (or any OSRM-compatible endpoint)
 * for real deployments.
 */
const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org'

const PROFILE_MAP: Record<TravelProfile, string> = {
  driving: 'driving',
  walking: 'foot',
}

export class OsrmProvider implements RoutingProvider {
  readonly name = 'osrm'

  async route(from: LngLat, to: LngLat, profile: TravelProfile): Promise<Route | null> {
    const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`
    const url = `${OSRM_URL}/route/v1/${PROFILE_MAP[profile]}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=false`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return null
      const data = await res.json()
      if (data.code !== 'Ok' || !data.routes?.length) return null
      const r = data.routes[0]
      const geometry: LngLat[] = r.geometry.coordinates
      const steps: RouteStep[] = []
      let geomIndex = 0
      for (const leg of r.legs ?? []) {
        for (const step of leg.steps ?? []) {
          steps.push({
            instruction: describeManeuver(step),
            distanceMeters: step.distance,
            durationSeconds: step.duration,
            geometryIndex: geomIndex,
            maneuver: normalizeOsrmManeuver(step),
          })
          geomIndex += Math.max(0, (step.geometry?.coordinates?.length ?? 1) - 1)
        }
      }
      return {
        geometry,
        distanceMeters: r.distance,
        durationSeconds: r.duration,
        steps,
        provider: this.name,
        approximate: false,
      }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

function normalizeOsrmManeuver(step: any): Maneuver | undefined {
  const type = step.maneuver?.type ?? ''
  const modifier: string = step.maneuver?.modifier ?? ''
  const side = modifier.includes('left') ? 'left' : modifier.includes('right') ? 'right' : ''
  switch (type) {
    case 'depart':
      return 'depart'
    case 'arrive':
      return 'arrive'
    case 'turn':
    case 'end of road':
      if (modifier === 'uturn') return 'uturn'
      if (modifier.startsWith('slight')) return side === 'left' ? 'slight-left' : 'slight-right'
      if (modifier.startsWith('sharp')) return side === 'left' ? 'sharp-left' : 'sharp-right'
      if (side) return side === 'left' ? 'turn-left' : 'turn-right'
      return 'straight'
    case 'merge':
      return 'merge'
    case 'on ramp':
    case 'off ramp':
      return side === 'left' ? 'ramp-left' : 'ramp-right'
    case 'fork':
      return side === 'left' ? 'fork-left' : 'fork-right'
    case 'roundabout':
    case 'rotary':
      return 'roundabout'
    case 'continue':
      if (modifier === 'uturn') return 'uturn'
      return 'straight'
    default:
      return undefined
  }
}

function describeManeuver(step: any): string {
  const type = step.maneuver?.type ?? ''
  const modifier = step.maneuver?.modifier ?? ''
  const road = step.name || step.ref || ''
  const onto = road ? ` onto ${road}` : ''
  switch (type) {
    case 'depart':
      return `Head ${modifier || 'out'}${onto}`
    case 'arrive':
      return 'Arrive at your destination'
    case 'turn':
      return `Turn ${modifier}${onto}`
    case 'merge':
      return `Merge ${modifier}${onto}`
    case 'on ramp':
      return `Take the ramp${onto}`
    case 'off ramp':
      return `Take the exit${onto}`
    case 'fork':
      return `Keep ${modifier}${onto}`
    case 'roundabout':
    case 'rotary':
      return `Take the roundabout${onto}`
    case 'continue':
      return `Continue ${modifier}${onto}`
    case 'end of road':
      return `At the end of the road, turn ${modifier}${onto}`
    default:
      return road ? `Continue on ${road}` : 'Continue'
  }
}
