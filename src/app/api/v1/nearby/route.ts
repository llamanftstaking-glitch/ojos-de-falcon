import type { NextRequest } from 'next/server'
import { queryNearby, parseCategoriesParam } from '@/lib/locations'
import { bootstrap, ok, badRequest, serverError, parseLngLat, parseNumber } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/nearby?at=lng,lat&categories=police&radius=8000&limit=20
 * Nearest safety locations to a point, widening the search when sparse.
 */
export function GET(request: NextRequest) {
  try {
    bootstrap()
    const params = request.nextUrl.searchParams
    const center = parseLngLat(params.get('at'))
    if (!center) return badRequest('Missing or invalid at=lng,lat')
    const results = queryNearby({
      center,
      categories: parseCategoriesParam(params.get('categories')),
      radiusMeters: parseNumber(params.get('radius')),
      limit: parseNumber(params.get('limit')),
    })
    return ok({ results, count: results.length })
  } catch (err) {
    console.error('[nearby]', err)
    return serverError()
  }
}
