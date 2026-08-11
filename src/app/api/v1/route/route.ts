import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { computeRoute } from '@/lib/routing'
import { bootstrap, ok, badRequest, serverError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  from: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  to: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  profile: z.enum(['driving', 'walking']).default('driving'),
})

/**
 * POST /api/v1/route  { from: [lng,lat], to: [lng,lat], profile }
 * Road route via the routing provider chain. `approximate: true` in the
 * response means a direct-path estimate (no provider reachable) — the
 * client must label it and must not present turn-by-turn.
 */
export async function POST(request: NextRequest) {
  try {
    bootstrap()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return badRequest('Expected { from: [lng,lat], to: [lng,lat], profile? }')
    const { from, to, profile } = parsed.data
    const route = await computeRoute(from, to, profile)
    return ok({ route })
  } catch (err) {
    console.error('[route]', err)
    return serverError('Routing unavailable')
  }
}
