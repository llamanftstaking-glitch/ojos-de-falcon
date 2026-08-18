import type { NextRequest } from 'next/server'
import { resolvePlace } from '@/lib/places'
import { bootstrap, ok, badRequest, notFound, serverError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/place?id=<placeId>
 * Resolve an autocomplete suggestion to coordinates for routing.
 */
export async function GET(request: NextRequest) {
  try {
    bootstrap()
    const id = (request.nextUrl.searchParams.get('id') || '').trim()
    if (!id) return badRequest('Missing id')
    const place = await resolvePlace(id)
    if (!place) return notFound('Place not found')
    return ok({ place })
  } catch (err) {
    console.error('[place]', err)
    return serverError()
  }
}
