import type { LngLat } from '../geo'

export interface RouteStep {
  instruction: string
  distanceMeters: number
  durationSeconds: number
  /** Index into the route geometry where this step begins. */
  geometryIndex: number
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
