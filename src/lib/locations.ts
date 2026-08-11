import type Database from 'better-sqlite3'
import { getDatabase } from './db'
import type { SafetyLocation, NearbyResult, VerificationStatus } from './types'
import { isSafetyCategory, type SafetyCategory, CATEGORIES } from './categories'
import { bboxAround, haversineMeters, estimateDriveMinutes, type BBox, type LngLat } from './geo'

interface Row {
  id: string
  name: string
  category: string
  subcategory: string | null
  latitude: number
  longitude: number
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string
  phone: string | null
  non_emergency_phone: string | null
  website: string | null
  hours: string | null
  is_24_hours: number | null
  verification: string
  source: string
  source_attribution: string | null
  last_verified: string | null
  jurisdiction: string | null
  services: string
  accessibility: string | null
  parking: string | null
  public_entrance: string | null
  metadata: string
  created_at: string
  updated_at: string
}

function rowToLocation(row: Row): SafetyLocation {
  return {
    id: row.id,
    name: row.name,
    category: row.category as SafetyCategory,
    subcategory: row.subcategory,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    country: row.country,
    phone: row.phone,
    nonEmergencyPhone: row.non_emergency_phone,
    website: row.website,
    hours: row.hours,
    is24Hours: row.is_24_hours === null ? null : row.is_24_hours === 1,
    verification: row.verification as VerificationStatus,
    source: row.source,
    sourceAttribution: row.source_attribution,
    lastVerified: row.last_verified,
    jurisdiction: row.jurisdiction,
    services: safeParseArray(row.services),
    accessibility: row.accessibility,
    parking: row.parking,
    publicEntrance: row.public_entrance,
    metadata: safeParseObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function safeParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeParseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export interface BBoxQuery {
  bbox: BBox
  categories?: SafetyCategory[]
  /** Map zoom — used for priority thinning (tier/minZoom). */
  zoom?: number
  limit?: number
}

export function queryByBBox(query: BBoxQuery): SafetyLocation[] {
  const db = getDatabase()
  const cats = resolveCategories(query.categories, query.zoom)
  if (cats.length === 0) return []
  const limit = Math.min(Math.max(query.limit ?? 500, 1), 2000)
  const placeholders = cats.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT * FROM safety_locations
       WHERE latitude BETWEEN ? AND ?
         AND longitude BETWEEN ? AND ?
         AND category IN (${placeholders})
         AND verification != 'permanently_closed'
       LIMIT ?`
    )
    .all(
      query.bbox.south,
      query.bbox.north,
      query.bbox.west,
      query.bbox.east,
      ...cats,
      limit
    ) as Row[]
  return rows.map(rowToLocation)
}

function resolveCategories(
  categories: SafetyCategory[] | undefined,
  zoom: number | undefined
): SafetyCategory[] {
  let cats = categories && categories.length > 0 ? categories : (Object.keys(CATEGORIES) as SafetyCategory[])
  if (zoom !== undefined) {
    cats = cats.filter((c) => zoom >= CATEGORIES[c].minZoom)
  }
  return cats
}

export interface NearbyQuery {
  center: LngLat
  radiusMeters?: number
  categories?: SafetyCategory[]
  limit?: number
}

/**
 * Nearest locations to a point. Bounding-box prefilter via the lat/lng
 * index, exact haversine ranking in memory. If nothing is found within the
 * radius, the search widens (people in rural areas still need an answer).
 */
export function queryNearby(query: NearbyQuery): NearbyResult[] {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  let radius = query.radiusMeters ?? 8000
  const maxRadius = 160_000 // ~100 miles — beyond this, report honestly that nothing is near

  for (; radius <= maxRadius; radius *= 2) {
    const results = queryByBBox({
      bbox: bboxAround(query.center, radius),
      categories: query.categories,
      limit: 2000,
    })
      .map((location) => {
        const distanceMeters = haversineMeters(query.center, [location.longitude, location.latitude])
        return {
          location,
          distanceMeters,
          etaMinutes: estimateDriveMinutes(distanceMeters),
        }
      })
      .filter((r) => r.distanceMeters <= radius)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
    if (results.length > 0) return results.slice(0, limit)
  }
  return []
}

export function getLocationById(id: string): SafetyLocation | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM safety_locations WHERE id = ?').get(id) as Row | undefined
  return row ? rowToLocation(row) : null
}

export interface SearchQuery {
  text: string
  center?: LngLat
  limit?: number
}

export function searchLocations(query: SearchQuery): SafetyLocation[] {
  const db = getDatabase()
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50)
  const term = query.text.trim()
  if (!term) return []

  // FTS5 match; escape embedded quotes and use prefix matching on the last token.
  const tokens = term
    .split(/\s+/)
    .map((t) => t.replace(/["*']/g, ''))
    .filter(Boolean)
  if (tokens.length === 0) return []
  const match = tokens.map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(' ')

  let ids: string[] = []
  try {
    ids = (
      db
        .prepare('SELECT id FROM safety_locations_fts WHERE safety_locations_fts MATCH ? LIMIT ?')
        .all(match, limit * 3) as { id: string }[]
    ).map((r) => r.id)
  } catch {
    // FTS syntax error from unusual input — fall back to LIKE.
    ids = (
      db
        .prepare('SELECT id FROM safety_locations WHERE name LIKE ? LIMIT ?')
        .all(`%${term}%`, limit * 3) as { id: string }[]
    ).map((r) => r.id)
  }
  if (ids.length === 0) return []

  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT * FROM safety_locations WHERE id IN (${placeholders})`)
    .all(...ids) as Row[]
  let results = rows.map(rowToLocation)

  if (query.center) {
    const c = query.center
    results = results.sort(
      (a, b) =>
        haversineMeters(c, [a.longitude, a.latitude]) - haversineMeters(c, [b.longitude, b.latitude])
    )
  }
  return results.slice(0, limit)
}

export type UpsertInput = Omit<SafetyLocation, 'createdAt' | 'updatedAt'>

export function upsertLocation(input: UpsertInput): void {
  const db = getDatabase()
  upsertWithDb(db, input)
}

function upsertWithDb(db: Database.Database, input: UpsertInput): void {
  db.prepare(
    `INSERT INTO safety_locations (
      id, name, category, subcategory, latitude, longitude, address, city, state, zip,
      country, phone, non_emergency_phone, website, hours, is_24_hours, verification,
      source, source_attribution, last_verified, jurisdiction, services, accessibility,
      parking, public_entrance, metadata, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      subcategory = excluded.subcategory,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      address = excluded.address,
      city = excluded.city,
      state = excluded.state,
      zip = excluded.zip,
      country = excluded.country,
      phone = excluded.phone,
      non_emergency_phone = excluded.non_emergency_phone,
      website = excluded.website,
      hours = excluded.hours,
      is_24_hours = excluded.is_24_hours,
      verification = excluded.verification,
      source = excluded.source,
      source_attribution = excluded.source_attribution,
      last_verified = excluded.last_verified,
      jurisdiction = excluded.jurisdiction,
      services = excluded.services,
      accessibility = excluded.accessibility,
      parking = excluded.parking,
      public_entrance = excluded.public_entrance,
      metadata = excluded.metadata,
      updated_at = datetime('now')`
  ).run(
    input.id,
    input.name,
    input.category,
    input.subcategory,
    input.latitude,
    input.longitude,
    input.address,
    input.city,
    input.state,
    input.zip,
    input.country,
    input.phone,
    input.nonEmergencyPhone,
    input.website,
    input.hours,
    input.is24Hours === null ? null : input.is24Hours ? 1 : 0,
    input.verification,
    input.source,
    input.sourceAttribution,
    input.lastVerified,
    input.jurisdiction,
    JSON.stringify(input.services),
    input.accessibility,
    input.parking,
    input.publicEntrance,
    JSON.stringify(input.metadata),
  )
  db.prepare('DELETE FROM safety_locations_fts WHERE id = ?').run(input.id)
  db.prepare(
    'INSERT INTO safety_locations_fts (id, name, address, city, category) VALUES (?, ?, ?, ?, ?)'
  ).run(input.id, input.name, input.address ?? '', input.city ?? '', input.category)
}

export function bulkUpsert(inputs: UpsertInput[]): number {
  const db = getDatabase()
  const tx = db.transaction((items: UpsertInput[]) => {
    for (const item of items) upsertWithDb(db, item)
  })
  tx(inputs)
  return inputs.length
}

export function countLocations(): number {
  const db = getDatabase()
  const row = db.prepare('SELECT COUNT(*) AS n FROM safety_locations').get() as { n: number }
  return row.n
}

/**
 * Duplicate detection: two records are duplicate candidates when they are
 * the same category, within `radiusMeters` of each other, and their
 * normalized names overlap. Used by importers to avoid double-inserting the
 * same facility from different sources.
 */
export function findDuplicateCandidate(
  input: Pick<UpsertInput, 'name' | 'category' | 'latitude' | 'longitude'>,
  radiusMeters = 150
): SafetyLocation | null {
  const near = queryByBBox({
    bbox: bboxAround([input.longitude, input.latitude], radiusMeters),
    categories: [input.category],
    limit: 50,
  })
  const target = normalizeName(input.name)
  for (const candidate of near) {
    const dist = haversineMeters(
      [input.longitude, input.latitude],
      [candidate.longitude, candidate.latitude]
    )
    if (dist > radiusMeters) continue
    if (namesOverlap(target, normalizeName(candidate.name))) return candidate
  }
  return null
}

export function normalizeName(name: string): string[] {
  const STOPWORDS = new Set([
    'the', 'of', 'and', 'department', 'dept', 'station', 'house', 'precinct',
    'pct', 'engine', 'ladder', 'company', 'co', 'city', 'county', 'new', 'york',
  ])
  return name
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t))
}

function namesOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const setB = new Set(b)
  const shared = a.filter((t) => setB.has(t)).length
  return shared / Math.min(a.length, b.length) >= 0.5
}

export function parseCategoriesParam(raw: string | null): SafetyCategory[] | undefined {
  if (!raw) return undefined
  const cats = raw
    .split(',')
    .map((c) => c.trim())
    .filter(isSafetyCategory)
  return cats.length > 0 ? cats : undefined
}
