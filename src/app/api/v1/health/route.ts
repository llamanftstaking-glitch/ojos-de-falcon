import { NextResponse } from 'next/server'
import { countLocations } from '@/lib/locations'
import { bootstrap } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export function GET() {
  try {
    bootstrap()
    return NextResponse.json({ ok: true, status: 'healthy', locations: countLocations() })
  } catch (err) {
    return NextResponse.json({ ok: false, status: 'unhealthy', error: String(err) }, { status: 500 })
  }
}
