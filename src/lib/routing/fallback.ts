import type { LngLat } from '../geo'
import { haversineMeters } from '../geo'
import type { Route, RoutingProvider, TravelProfile } from './types'

/**
 * Straight-line fallback used only when no road-routing provider is
 * reachable (offline, provider outage). Marked `approximate: true` — the UI
 * shows it as a direct-path estimate, never as turn-by-turn directions.
 */
export class DirectPathProvider implements RoutingProvider {
  readonly name = 'direct-path'

  async route(from: LngLat, to: LngLat, profile: TravelProfile): Promise<Route> {
    const distance = haversineMeters(from, to)
    // Roads are never straight: inflate by a detour factor, then apply
    // conservative average speeds.
    const roadDistance = distance * 1.35
    const speedMps = profile === 'walking' ? 1.3 : 8.0
    return {
      geometry: [from, to],
      distanceMeters: roadDistance,
      durationSeconds: roadDistance / speedMps,
      steps: [],
      provider: this.name,
      approximate: true,
    }
  }
}
