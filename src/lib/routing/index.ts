import type { LngLat } from '../geo'
import { GoogleRoutesProvider } from './google'
import { OsrmProvider } from './osrm'
import { DirectPathProvider } from './fallback'
import type { Route, RoutingProvider, TravelProfile } from './types'

export type { Route, RouteStep, RoutingProvider, TravelProfile } from './types'

/**
 * Provider chain: Google Routes when GOOGLE_MAPS_API_KEY is configured,
 * then OSRM, then a clearly labeled direct-path approximation so safety
 * features keep working offline or during a provider outage.
 */
const chain: RoutingProvider[] = [
  new GoogleRoutesProvider(),
  new OsrmProvider(),
  new DirectPathProvider(),
]

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
