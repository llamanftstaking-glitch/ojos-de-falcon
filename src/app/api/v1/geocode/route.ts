import type { NextRequest } from 'next/server'
import { geocodeText } from '@/lib/geocoding'
import { bootstrap, ok, badRequest, serverError, parseLngLat } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/geocode?q=address&at=lng,lat
 * Forward geocoding via the server-side adapter chain (Google when
 * configured, Nominatim otherwise). Keys never reach the client.
 */
export async function GET(request: NextRequest) {
  try {
    bootstrap()
    const params = request.nextUrl.searchParams
    const q = (params.get('q') || '').trim()
    if (!q) return badRequest('Missing q')
    const results = await geocodeText(q, parseLngLat(params.get('at')) ?? undefined)
    return ok({ results, count: results.length })
  } catch (err) {
    console.error('[geocode]', err)
    return serverError()
  }
}
