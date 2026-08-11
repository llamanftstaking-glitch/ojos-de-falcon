import type { SafetyCategory } from './categories'

export type VerificationStatus =
  | 'verified_official'
  | 'verified_community'
  | 'unverified'
  | 'needs_review'
  | 'temporarily_closed'
  | 'permanently_closed'

/**
 * Normalized safety POI model. Unknown fields are null — never fabricated.
 */
export interface SafetyLocation {
  id: string
  name: string
  category: SafetyCategory
  /** e.g. police → 'local' | 'transit' | 'campus'; courthouse → 'federal' | 'family'... */
  subcategory: string | null
  latitude: number
  longitude: number
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string
  phone: string | null
  nonEmergencyPhone: string | null
  website: string | null
  /** Free-text opening hours (OSM opening_hours syntax or human text). */
  hours: string | null
  is24Hours: boolean | null
  verification: VerificationStatus
  /** Where this record came from, e.g. 'osm', 'seed-demo', 'manual'. */
  source: string
  /** Attribution string for the source, shown in the UI. */
  sourceAttribution: string | null
  lastVerified: string | null
  jurisdiction: string | null
  /** Verified services offered, e.g. ['emergency_department']. Empty if unknown. */
  services: string[]
  accessibility: string | null
  parking: string | null
  publicEntrance: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface NearbyResult {
  location: SafetyLocation
  distanceMeters: number
  etaMinutes: number
}

export interface RouteSafetyResult {
  location: SafetyLocation
  /** Perpendicular distance from the route polyline (m). */
  distanceFromRouteMeters: number
  /** Distance along the route from the traveler's position (m). Negative = behind. */
  distanceAheadMeters: number
  /** Minutes until the traveler passes the closest point on route. */
  minutesAhead: number
  /** Rough extra minutes to divert to this location and return. */
  detourMinutes: number
}

export interface SafeDestinationCandidate {
  location: SafetyLocation
  distanceMeters: number
  etaMinutes: number
  score: number
  reasons: string[]
}
