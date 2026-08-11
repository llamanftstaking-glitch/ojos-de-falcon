import type { NextRequest } from 'next/server'
import { searchLocations } from '@/lib/locations'
import { bootstrap, ok, badRequest, serverError, parseLngLat, parseNumber } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/search?q=police+near+me&at=lng,lat
 * Full-text search over safety locations, distance-sorted when a center
 * is provided. Address / place geocoding is handled client-side via the
 * geocoding adapter; this endpoint covers the safety POI corpus.
 */
export function GET(request: NextRequest) {
  try {
    bootstrap()
    const params = request.nextUrl.searchParams
    const q = (params.get('q') || '').trim()
    if (!q) return badRequest('Missing q')
    const results = searchLocations({
      text: q,
      center: parseLngLat(params.get('at')) ?? undefined,
      limit: parseNumber(params.get('limit')),
    })
    return ok({ results, count: results.length })
  } catch (err) {
    console.error('[search]', err)
    return serverError()
  }
}
