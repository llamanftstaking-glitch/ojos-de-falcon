import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Point the DB at a temp dir before any lib import touches it.
const tempDir = mkdtempSync(join(tmpdir(), 'odf-test-'))
process.env.OJOS_DB_PATH = join(tempDir, 'test.db')

const { bulkUpsert, queryNearby, queryByBBox, searchLocations, findDuplicateCandidate, normalizeName } =
  await import('@/lib/locations')
const { analyzeRouteSafety, summarizeRouteSafety } = await import('@/lib/route-safety')
const { rankSafeDestinations } = await import('@/lib/safe-destination')
const { closeDatabase } = await import('@/lib/db')

import type { UpsertInput } from '@/lib/locations'

function loc(partial: Partial<UpsertInput> & Pick<UpsertInput, 'id' | 'name' | 'category' | 'latitude' | 'longitude'>): UpsertInput {
  return {
    subcategory: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    country: 'US',
    phone: null,
    nonEmergencyPhone: null,
    website: null,
    hours: null,
    is24Hours: null,
    verification: 'unverified',
    source: 'test',
    sourceAttribution: null,
    lastVerified: null,
    jurisdiction: null,
    services: [],
    accessibility: null,
    parking: null,
    publicEntrance: null,
    metadata: {},
    ...partial,
  }
}

beforeAll(() => {
  bulkUpsert([
    loc({ id: 'p1', name: 'Central Police Precinct', category: 'police', latitude: 40.75, longitude: -73.99 }),
    loc({ id: 'p2', name: 'North Police Precinct', category: 'police', latitude: 40.80, longitude: -73.95 }),
    loc({ id: 'f1', name: 'Engine 7 Fire Station', category: 'fire_station', latitude: 40.751, longitude: -73.988 }),
    loc({ id: 'h1', name: 'General Hospital', category: 'hospital', latitude: 40.74, longitude: -73.98, is24Hours: true, services: ['emergency_department'] }),
    loc({ id: 'h2', name: 'Closed Clinic', category: 'hospital', latitude: 40.7505, longitude: -73.9895, verification: 'temporarily_closed' }),
    loc({ id: 'c1', name: 'County Courthouse', category: 'courthouse', latitude: 40.713, longitude: -74.002 }),
    loc({ id: 'far1', name: 'Distant Sheriff Office', category: 'sheriff', latitude: 41.5, longitude: -73.5 }),
  ])
})

afterAll(() => {
  closeDatabase()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('queryByBBox', () => {
  it('returns only locations inside the box', () => {
    const results = queryByBBox({
      bbox: { west: -74.05, south: 40.7, east: -73.94, north: 40.82 },
    })
    expect(results.map((r) => r.id)).not.toContain('far1')
    expect(results.length).toBeGreaterThanOrEqual(5)
  })

  it('filters by category', () => {
    const results = queryByBBox({
      bbox: { west: -74.05, south: 40.7, east: -73.94, north: 40.82 },
      categories: ['police'],
    })
    expect(results.every((r) => r.category === 'police')).toBe(true)
  })

  it('applies zoom-based thinning (courthouse hidden at zoom 9)', () => {
    const results = queryByBBox({
      bbox: { west: -74.05, south: 40.7, east: -73.94, north: 40.82 },
      zoom: 9,
    })
    expect(results.map((r) => r.id)).not.toContain('c1')
    expect(results.map((r) => r.id)).toContain('p1')
  })
})

describe('queryNearby', () => {
  it('sorts by distance and widens when sparse', () => {
    const results = queryNearby({ center: [-73.99, 40.75], limit: 3 })
    expect(results[0].location.id).toBe('p1')
    expect(results[0].distanceMeters).toBeLessThan(results[1].distanceMeters)
  })

  it('finds distant facilities when nothing is close (rural scenario)', () => {
    const results = queryNearby({ center: [-73.52, 41.48], limit: 1 })
    expect(results.length).toBe(1)
    expect(results[0].location.id).toBe('far1')
  })
})

describe('searchLocations', () => {
  it('matches by name with prefix', () => {
    const results = searchLocations({ text: 'centr' })
    expect(results.map((r) => r.id)).toContain('p1')
  })

  it('ranks by distance when a center is given', () => {
    const results = searchLocations({ text: 'police', center: [-73.95, 40.8] })
    expect(results[0].id).toBe('p2')
  })
})

describe('deduplication', () => {
  it('normalizes precinct name variants to overlapping tokens', () => {
    const a = normalizeName('NYPD 44 Precinct')
    const b = normalizeName('44th Precinct NYPD')
    expect(a).toContain('44')
    expect(b).toContain('44')
    expect(a).toContain('nypd')
  })

  it('detects a nearby same-category near-duplicate', () => {
    const dupe = findDuplicateCandidate({
      name: 'Central Precinct Police',
      category: 'police',
      latitude: 40.7501,
      longitude: -73.9901,
    })
    expect(dupe?.id).toBe('p1')
  })

  it('does not match distinct facilities', () => {
    const dupe = findDuplicateCandidate({
      name: 'Totally Different Bureau',
      category: 'police',
      latitude: 40.7501,
      longitude: -73.9901,
    })
    expect(dupe).toBeNull()
  })
})

describe('analyzeRouteSafety', () => {
  // Route heading north up Manhattan-ish coordinates past p1/f1.
  const geometry: [number, number][] = [
    [-73.99, 40.74],
    [-73.99, 40.76],
    [-73.98, 40.78],
  ]

  it('finds facilities in the corridor with forward distances', () => {
    const results = analyzeRouteSafety({ geometry, corridorMeters: 1500 })
    const ids = results.map((r) => r.location.id)
    expect(ids).toContain('p1')
    expect(ids).toContain('f1')
    const p1 = results.find((r) => r.location.id === 'p1')!
    expect(p1.distanceAheadMeters).toBeGreaterThan(0)
    expect(p1.distanceFromRouteMeters).toBeLessThan(1500)
  })

  it('marks passed facilities as behind the traveler', () => {
    const results = analyzeRouteSafety({
      geometry,
      corridorMeters: 1500,
      progressMeters: 4000,
    })
    const p1 = results.find((r) => r.location.id === 'p1')
    expect(p1?.distanceAheadMeters).toBeLessThan(0)
  })

  it('summarizes by category group', () => {
    const results = analyzeRouteSafety({ geometry, corridorMeters: 1500 })
    const summary = summarizeRouteSafety(results)
    expect(summary.policeCount).toBeGreaterThanOrEqual(1)
    expect(summary.fireCount).toBeGreaterThanOrEqual(1)
    expect(summary.total).toBe(results.length)
  })

  it('returns empty for degenerate geometry', () => {
    expect(analyzeRouteSafety({ geometry: [[-73.99, 40.74]] as any })).toEqual([])
  })
})

describe('rankSafeDestinations', () => {
  it('prefers open, high-priority facilities over closed nearer ones', () => {
    const candidates = rankSafeDestinations({ center: [-73.99, 40.75] })
    expect(candidates.length).toBeGreaterThan(0)
    // The temporarily closed clinic must never outrank the police station
    // despite being geographically closest.
    const closedIndex = candidates.findIndex((c) => c.location.id === 'h2')
    const policeIndex = candidates.findIndex((c) => c.location.id === 'p1')
    expect(policeIndex).toBeGreaterThanOrEqual(0)
    if (closedIndex !== -1) expect(policeIndex).toBeLessThan(closedIndex)
  })

  it('includes explainable reasons', () => {
    const candidates = rankSafeDestinations({ center: [-73.99, 40.75] })
    expect(candidates[0].reasons.length).toBeGreaterThan(0)
  })
})
