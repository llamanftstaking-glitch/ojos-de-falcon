import type { NextRequest } from 'next/server'
import { rankSafeDestinations } from '@/lib/safe-destination'
import { parseCategoriesParam } from '@/lib/locations'
import { bootstrap, ok, badRequest, serverError, parseLngLat, parseNumber } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/safe-destination?at=lng,lat
 * "Take me somewhere safe" — ranked safe destinations near a point.
 * Not simply the closest facility: scoring weighs travel time, facility
 * priority, open status, and verification confidence.
 */
export function GET(request: NextRequest) {
  try {
    bootstrap()
    const params = request.nextUrl.searchParams
    const center = parseLngLat(params.get('at'))
    if (!center) return badRequest('Missing or invalid at=lng,lat')
    const candidates = rankSafeDestinations({
      center,
      categories: parseCategoriesParam(params.get('categories')),
      limit: parseNumber(params.get('limit')),
    })
    return ok({ candidates, count: candidates.length })
  } catch (err) {
    console.error('[safe-destination]', err)
    return serverError()
  }
}
