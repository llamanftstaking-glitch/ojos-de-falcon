import type { NextRequest } from 'next/server'
import { queryByBBox, parseCategoriesParam } from '@/lib/locations'
import { bootstrap, ok, badRequest, serverError, parseNumber } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/safety-locations?bbox=west,south,east,north&categories=police,hospital&zoom=12
 * Bounding-box POI query with zoom-based priority thinning.
 */
export function GET(request: NextRequest) {
  try {
    bootstrap()
    const params = request.nextUrl.searchParams
    const bboxRaw = params.get('bbox')
    if (!bboxRaw) return badRequest('Missing bbox=west,south,east,north')
    const parts = bboxRaw.split(',').map(Number)
    if (parts.length !== 4 || !parts.every(Number.isFinite)) {
      return badRequest('Invalid bbox — expected west,south,east,north')
    }
    const [west, south, east, north] = parts
    const locations = queryByBBox({
      bbox: { west, south, east, north },
      categories: parseCategoriesParam(params.get('categories')),
      zoom: parseNumber(params.get('zoom')),
      limit: parseNumber(params.get('limit'), 500),
    })
    return ok({ locations, count: locations.length })
  } catch (err) {
    console.error('[safety-locations]', err)
    return serverError()
  }
}
