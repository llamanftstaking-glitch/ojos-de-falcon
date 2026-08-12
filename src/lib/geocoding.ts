import type { LngLat } from './geo'

/**
 * Server-side geocoding adapter chain. Google Geocoding API when
 * GOOGLE_MAPS_API_KEY is set (requires "Geocoding API" enabled on the
 * key's project), otherwise a Nominatim-compatible endpoint. The API key
 * never leaves the server — clients call /api/v1/geocode.
 */

export interface GeocodeHit {
  name: string
  lngLat: LngLat
  provider: string
}

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || ''
const NOMINATIM_URL = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org'

export async function geocodeText(query: string, near?: LngLat): Promise<GeocodeHit[]> {
  if (GOOGLE_KEY) {
    const hits = await googleGeocode(query, near)
    if (hits) return hits
    // Fall through to Nominatim on Google failure — degraded, not dead.
  }
  return nominatimGeocode(query, near)
}

async function googleGeocode(query: string, near?: LngLat): Promise<GeocodeHit[] | null> {
  const params = new URLSearchParams({ address: query, key: GOOGLE_KEY })
  if (near) {
    const d = 0.4
    params.set('bounds', `${near[1] - d},${near[0] - d}|${near[1] + d},${near[0] + d}`)
  }
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'OK' || !Array.isArray(data.results)) {
      if (data.status !== 'ZERO_RESULTS') {
        console.error('[geocode/google]', data.status, data.error_message ?? '')
        return null
      }
      return []
    }
    return data.results.slice(0, 5).map((r: any) => ({
      name: r.formatted_address as string,
      lngLat: [r.geometry.location.lng, r.geometry.location.lat] as LngLat,
      provider: 'google',
    }))
  } catch (err) {
    console.error('[geocode/google]', err)
    return null
  }
}

async function nominatimGeocode(query: string, near?: LngLat): Promise<GeocodeHit[]> {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5' })
  if (near) {
    const d = 0.5
    params.set('viewbox', `${near[0] - d},${near[1] + d},${near[0] + d},${near[1] - d}`)
  }
  try {
    const res = await fetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'ojos-de-falcon/0.1' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const items = (await res.json()) as { display_name: string; lat: string; lon: string }[]
    return items.map((i) => ({
      name: i.display_name,
      lngLat: [Number(i.lon), Number(i.lat)] as LngLat,
      provider: 'nominatim',
    }))
  } catch {
    return []
  }
}
