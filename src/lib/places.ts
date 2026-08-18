import type { LngLat } from './geo'

/**
 * Google Places autocomplete + details, server-side only — the key never
 * reaches the client. Supports both the legacy Places API and Places API
 * (New); we detect which one the key can use and remember it for the
 * process lifetime. No key (or no quota) degrades to empty results and the
 * caller falls back to plain geocoding.
 */

const KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''

export interface PlaceSuggestion {
  placeId: string
  /** Primary line, e.g. business or street address. */
  main: string
  /** Secondary line, e.g. city/region. */
  secondary: string
}

export interface PlaceResolved {
  name: string
  address: string | null
  lngLat: LngLat
}

type Provider = 'legacy' | 'new'
let working: Provider | null = null

export async function autocompletePlaces(input: string, near?: LngLat): Promise<PlaceSuggestion[]> {
  if (!KEY) return []
  const order: Provider[] = working ? [working] : ['legacy', 'new']
  for (const provider of order) {
    try {
      const results =
        provider === 'legacy' ? await legacyAutocomplete(input, near) : await newAutocomplete(input, near)
      if (results !== null) {
        working = provider
        return results
      }
    } catch {
      // Network/parse failure — try the other provider or give up quietly.
    }
  }
  return []
}

export async function resolvePlace(placeId: string): Promise<PlaceResolved | null> {
  if (!KEY) return null
  const provider = working ?? 'legacy'
  try {
    return provider === 'legacy' ? await legacyDetails(placeId) : await newDetails(placeId)
  } catch {
    return null
  }
}

// --- legacy Places API ------------------------------------------------------

async function legacyAutocomplete(input: string, near?: LngLat): Promise<PlaceSuggestion[] | null> {
  const params = new URLSearchParams({ input, key: KEY })
  if (near) {
    params.set('location', `${near[1]},${near[0]}`)
    params.set('radius', '50000')
  }
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`)
  const data = (await res.json()) as {
    status: string
    error_message?: string
    predictions?: {
      place_id: string
      description: string
      structured_formatting?: { main_text?: string; secondary_text?: string }
    }[]
  }
  if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
    console.error('[places/legacy]', data.status, data.error_message ?? '')
    return null
  }
  return (data.predictions ?? []).map((p) => ({
    placeId: p.place_id,
    main: p.structured_formatting?.main_text ?? p.description,
    secondary: p.structured_formatting?.secondary_text ?? '',
  }))
}

async function legacyDetails(placeId: string): Promise<PlaceResolved | null> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'geometry/location,name,formatted_address',
    key: KEY,
  })
  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`)
  const data = (await res.json()) as {
    status: string
    result?: {
      name?: string
      formatted_address?: string
      geometry?: { location?: { lat: number; lng: number } }
    }
  }
  const loc = data.result?.geometry?.location
  if (data.status !== 'OK' || !loc) return null
  return {
    name: data.result?.name ?? data.result?.formatted_address ?? 'Destination',
    address: data.result?.formatted_address ?? null,
    lngLat: [loc.lng, loc.lat],
  }
}

// --- Places API (New) -------------------------------------------------------

async function newAutocomplete(input: string, near?: LngLat): Promise<PlaceSuggestion[] | null> {
  const body: Record<string, unknown> = { input }
  if (near) {
    body.locationBias = {
      circle: { center: { latitude: near[1], longitude: near[0] }, radius: 50000 },
    }
  }
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY },
    body: JSON.stringify(body),
  })
  if (res.status === 403 || res.status === 401) {
    console.error('[places/new]', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string
        text?: { text?: string }
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
      }
    }[]
  }
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({
      placeId: p.placeId!,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }))
}

async function newDetails(placeId: string): Promise<PlaceResolved | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'location,displayName,formattedAddress' },
  })
  if (!res.ok) return null
  const data = (await res.json()) as {
    location?: { latitude: number; longitude: number }
    displayName?: { text?: string }
    formattedAddress?: string
  }
  if (!data.location) return null
  return {
    name: data.displayName?.text ?? data.formattedAddress ?? 'Destination',
    address: data.formattedAddress ?? null,
    lngLat: [data.location.longitude, data.location.latitude],
  }
}
