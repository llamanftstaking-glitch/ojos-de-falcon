import type { NextRequest } from 'next/server'
import { autocompletePlaces } from '@/lib/places'
import { bootstrap, ok, badRequest, serverError, parseLngLat } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/autocomplete?q=text&at=lng,lat
 * Type-ahead destination suggestions (addresses + businesses) via Google
 * Places, biased to the user's location. Empty when no key is configured —
 * the client falls back to plain geocoding.
 */
export async function GET(request: NextRequest) {
  try {
    bootstrap()
    const params = request.nextUrl.searchParams
    const q = (params.get('q') || '').trim()
    if (!q) return badRequest('Missing q')
    const results = await autocompletePlaces(q, parseLngLat(params.get('at')) ?? undefined)
    return ok({ results })
  } catch (err) {
    console.error('[autocomplete]', err)
    return serverError()
  }
}
