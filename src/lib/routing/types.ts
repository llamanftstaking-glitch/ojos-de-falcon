import type { LngLat } from '../geo'

/**
 * Provider-agnostic maneuver vocabulary — drives the big turn arrow in the
 * navigation banner. Providers map their own enums onto this set.
 */
export type Maneuver =
  | 'depart'
  | 'straight'
  | 'turn-left'
  | 'turn-right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'uturn'
  | 'merge'
  | 'fork-left'
  | 'fork-right'
  | 'ramp-left'
  | 'ramp-right'
  | 'roundabout'
  | 'arrive'

export interface RouteStep {
  instruction: string
  distanceMeters: number
  durationSeconds: number
  /** Index into the route geometry where this step begins. */
  geometryIndex: number
  maneuver?: Maneuver
}

export interface Route {
  /** Full route geometry as [lng, lat] pairs. */
  geometry: LngLat[]
  distanceMeters: number
  durationSeconds: number
  steps: RouteStep[]
  /** Which provider produced this route. */
  provider: string
  /**
   * True when this is a straight-line approximation, not a road route.
   * The UI must label it clearly and never present it as turn-by-turn.
   */
  approximate: boolean
}

export type TravelProfile = 'driving' | 'walking'

export interface RoutingProvider {
  readonly name: string
  route(from: LngLat, to: LngLat, profile: TravelProfile): Promise<Route | null>
}
