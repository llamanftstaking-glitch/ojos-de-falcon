import type { LngLat } from '../geo'
import { OsrmProvider } from './osrm'
import { DirectPathProvider } from './fallback'
import type { Route, RoutingProvider, TravelProfile } from './types'

export type { Route, RouteStep, RoutingProvider, TravelProfile } from './types'

/**
 * Provider chain: try real road routing first, fall back to a clearly
 * labeled direct-path approximation so safety features keep working
 * offline or during a provider outage.
 */
const chain: RoutingProvider[] = [new OsrmProvider(), new DirectPathProvider()]

export async function computeRoute(
  from: LngLat,
  to: LngLat,
  profile: TravelProfile = 'driving'
): Promise<Route> {
  for (const provider of chain) {
    const route = await provider.route(from, to, profile)
    if (route) return route
  }
  // DirectPathProvider never returns null; this is unreachable.
  throw new Error('No routing provider available')
}
