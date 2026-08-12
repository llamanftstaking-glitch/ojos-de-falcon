'use client'

import type { SafetyLocation, NearbyResult, RouteSafetyResult, SafeDestinationCandidate } from './types'
import type { Route } from './routing/types'
import type { LngLat, BBox } from './geo'
import type { SafetyCategory } from './categories'
import type { RouteSafetySummary } from './route-safety'

/**
 * Typed client for the v1 API with a small offline cache: successful
 * nearby/bbox responses are stored in localStorage so core safety data
 * stays available without connectivity — always labeled with its age,
 * never presented as live.
 */

interface ApiEnvelope<T> {
  ok: boolean
  data?: T
  error?: string
}

export class OfflineError extends Error {
  constructor(message = 'offline') {
    super(message)
    this.name = 'OfflineError'
  }
}

async function apiGet<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path)
  } catch {
    throw new OfflineError()
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!res.ok || !body?.ok || body.data === undefined) {
    throw new Error(body?.error || `Request failed (${res.status})`)
  }
  return body.data
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new OfflineError()
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!res.ok || !body?.ok || body.data === undefined) {
    throw new Error(body?.error || `Request failed (${res.status})`)
  }
  return body.data
}

// ---- offline cache -------------------------------------------------------

interface CachedPayload<T> {
  savedAt: number
  value: T
}

function cacheSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`odf-cache:${key}`, JSON.stringify({ savedAt: Date.now(), value }))
  } catch {
    // Storage full or unavailable — cache is best-effort.
  }
}

export function cacheGet<T>(key: string): CachedPayload<T> | null {
  try {
    const raw = localStorage.getItem(`odf-cache:${key}`)
    if (!raw) return null
    return JSON.parse(raw) as CachedPayload<T>
  } catch {
    return null
  }
}

// ---- endpoints -----------------------------------------------------------

export async function fetchLocationsInBBox(
  bbox: BBox,
  zoom: number,
  categories?: SafetyCategory[]
): Promise<SafetyLocation[]> {
  const params = new URLSearchParams({
    bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    zoom: String(Math.round(zoom * 10) / 10),
  })
  if (categories?.length) params.set('categories', categories.join(','))
  const data = await apiGet<{ locations: SafetyLocation[] }>(`/api/v1/safety-locations?${params}`)
  cacheSet('bbox-locations', data.locations)
  return data.locations
}

export async function fetchNearby(
  center: LngLat,
  categories?: SafetyCategory[],
  limit = 20
): Promise<{ results: NearbyResult[]; offline: boolean; savedAt: number | null }> {
  const params = new URLSearchParams({ at: `${center[0]},${center[1]}`, limit: String(limit) })
  if (categories?.length) params.set('categories', categories.join(','))
  try {
    const data = await apiGet<{ results: NearbyResult[] }>(`/api/v1/nearby?${params}`)
    cacheSet('nearby', data.results)
    return { results: data.results, offline: false, savedAt: null }
  } catch (err) {
    if (err instanceof OfflineError) {
      const cached = cacheGet<NearbyResult[]>('nearby')
      if (cached) return { results: cached.value, offline: true, savedAt: cached.savedAt }
    }
    throw err
  }
}

export async function fetchLocation(id: string): Promise<SafetyLocation> {
  const data = await apiGet<{ location: SafetyLocation }>(
    `/api/v1/safety-locations/${encodeURIComponent(id)}`
  )
  return data.location
}

export async function searchSafety(q: string, center?: LngLat): Promise<SafetyLocation[]> {
  const params = new URLSearchParams({ q })
  if (center) params.set('at', `${center[0]},${center[1]}`)
  const data = await apiGet<{ results: SafetyLocation[] }>(`/api/v1/search?${params}`)
  return data.results
}

export async function fetchRoute(
  from: LngLat,
  to: LngLat,
  profile: 'driving' | 'walking' = 'driving'
): Promise<Route> {
  const data = await apiPost<{ route: Route }>('/api/v1/route', { from, to, profile })
  return data.route
}

export async function fetchRouteSafety(input: {
  geometry: LngLat[]
  progressMeters?: number
  durationSeconds?: number
  categories?: SafetyCategory[]
}): Promise<{ results: RouteSafetyResult[]; summary: RouteSafetySummary }> {
  return apiPost('/api/v1/route-safety', input)
}

export async function fetchSafeDestinations(center: LngLat): Promise<SafeDestinationCandidate[]> {
  const data = await apiGet<{ candidates: SafeDestinationCandidate[] }>(
    `/api/v1/safe-destination?at=${center[0]},${center[1]}`
  )
  return data.candidates
}

/**
 * Forward geocoding for free-text destinations. Goes through our server
 * (/api/v1/geocode), which picks the provider — Google when a key is
 * configured, Nominatim otherwise — so provider keys never reach the
 * browser.
 */
export interface GeocodeResult {
  name: string
  lngLat: LngLat
}

export async function geocode(query: string, near?: LngLat): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q: query })
  if (near) params.set('at', `${near[0]},${near[1]}`)
  try {
    const data = await apiGet<{ results: GeocodeResult[] }>(`/api/v1/geocode?${params}`)
    return data.results
  } catch {
    return []
  }
}
