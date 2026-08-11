import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { analyzeRouteSafety, summarizeRouteSafety } from '@/lib/route-safety'
import { isSafetyCategory, type SafetyCategory } from '@/lib/categories'
import { bootstrap, ok, badRequest, serverError } from '@/lib/api-utils'
import type { LngLat } from '@/lib/geo'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  geometry: z
    .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
    .min(2)
    .max(20_000),
  progressMeters: z.number().min(0).optional(),
  durationSeconds: z.number().min(0).optional(),
  categories: z.array(z.string()).optional(),
  corridorMeters: z.number().min(100).max(10_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

/**
 * POST /api/v1/route-safety
 * Safety facilities along a route corridor: distance from route, distance
 * ahead of the traveler, minutes ahead, and detour estimate per facility.
 */
export async function POST(request: NextRequest) {
  try {
    bootstrap()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return badRequest('Expected { geometry: [[lng,lat],...], ... }')
    const categories = parsed.data.categories?.filter(isSafetyCategory) as SafetyCategory[] | undefined
    const results = analyzeRouteSafety({
      geometry: parsed.data.geometry as LngLat[],
      progressMeters: parsed.data.progressMeters,
      durationSeconds: parsed.data.durationSeconds,
      categories,
      corridorMeters: parsed.data.corridorMeters,
      limit: parsed.data.limit,
    })
    return ok({ results, summary: summarizeRouteSafety(results) })
  } catch (err) {
    console.error('[route-safety]', err)
    return serverError()
  }
}
