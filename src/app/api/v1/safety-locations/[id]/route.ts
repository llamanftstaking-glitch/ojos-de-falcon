import type { NextRequest } from 'next/server'
import { getLocationById } from '@/lib/locations'
import { bootstrap, ok, notFound, serverError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    bootstrap()
    const { id } = await params
    const location = getLocationById(id)
    if (!location) return notFound('Location not found')
    return ok({ location })
  } catch (err) {
    console.error('[safety-locations/:id]', err)
    return serverError()
  }
}
