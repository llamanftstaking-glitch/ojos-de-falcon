#!/usr/bin/env node
/**
 * OpenStreetMap importer — fetches real safety infrastructure from the
 * Overpass API for a bounding box and writes data/osm-import.json, which
 * the app loads on first boot (see src/lib/bootstrap.ts).
 *
 * Usage:
 *   node scripts/import-osm.mjs                       # NYC metro default
 *   node scripts/import-osm.mjs --bbox south,west,north,east
 *
 * Data © OpenStreetMap contributors, ODbL. Records are imported as
 * verification=unverified; the platform never presents OSM data as
 * officially verified.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter'

// Default: NYC metro (south, west, north, east)
let bbox = [40.48, -74.28, 41.2, -73.5]
const bboxArg = process.argv.indexOf('--bbox')
if (bboxArg !== -1 && process.argv[bboxArg + 1]) {
  const parts = process.argv[bboxArg + 1].split(',').map(Number)
  if (parts.length === 4 && parts.every(Number.isFinite)) bbox = parts
  else {
    console.error('Invalid --bbox; expected south,west,north,east')
    process.exit(1)
  }
}

const CATEGORY_QUERIES = [
  { category: 'police', filter: '["amenity"="police"]' },
  { category: 'fire_station', filter: '["amenity"="fire_station"]' },
  { category: 'hospital', filter: '["amenity"="hospital"]' },
  { category: 'courthouse', filter: '["amenity"="courthouse"]' },
  { category: 'shelter', filter: '["social_facility"="shelter"]' },
]

function overpassQuery(filter, [s, w, n, e]) {
  return `[out:json][timeout:90];(node${filter}(${s},${w},${n},${e});way${filter}(${s},${w},${n},${e});relation${filter}(${s},${w},${n},${e}););out center tags;`
}

function elementToRecord(el, category) {
  const tags = el.tags || {}
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (lat === undefined || lon === undefined || !tags.name) return null

  // ER detection: hospitals tagged emergency=yes have an emergency department.
  const services = []
  if (category === 'hospital' && tags.emergency === 'yes') services.push('emergency_department')

  const addressParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean)
  return {
    id: `osm-${el.type}-${el.id}`,
    name: tags.name,
    category,
    subcategory: tags.operator ? null : null,
    latitude: lat,
    longitude: lon,
    address: addressParts.length ? addressParts.join(' ') : null,
    city: tags['addr:city'] ?? null,
    state: tags['addr:state'] ?? null,
    zip: tags['addr:postcode'] ?? null,
    country: 'US',
    phone: tags.phone ?? tags['contact:phone'] ?? null,
    website: tags.website ?? tags['contact:website'] ?? null,
    hours: tags.opening_hours ?? null,
    is24Hours: tags.opening_hours === '24/7' ? true : null,
    verification: 'unverified',
    source: 'osm',
    sourceAttribution: '© OpenStreetMap contributors (ODbL)',
    jurisdiction: tags.operator ?? null,
    services,
    metadata: { osmType: el.type, osmId: el.id },
  }
}

// Overpass returns 406 without a descriptive User-Agent, and the public
// instances shed load with 429/504 — retry across mirrors with backoff.
const OVERPASS_MIRRORS = [OVERPASS_URL, 'https://overpass.kumi.systems/api/interpreter']
const USER_AGENT = 'ojos-de-falcon/1.0 (safety infrastructure import; gizertech@gmail.com)'

async function fetchOverpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length]
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: 'data=' + encodeURIComponent(query),
      })
      if (res.ok) return res
      process.stdout.write(`[${res.status} from ${new URL(url).host}, retrying] `)
    } catch (err) {
      process.stdout.write(`[${err.cause?.code || err.message}, retrying] `)
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
  }
  return null
}

async function run() {
  const all = []
  for (const { category, filter } of CATEGORY_QUERIES) {
    process.stdout.write(`Fetching ${category}… `)
    const res = await fetchOverpass(overpassQuery(filter, bbox))
    if (!res) {
      console.error(`FAILED — skipping ${category}`)
      continue
    }
    const data = await res.json()
    const records = (data.elements || []).map((el) => elementToRecord(el, category)).filter(Boolean)
    console.log(`${records.length} records`)
    all.push(...records)
    // Be polite to the public Overpass API.
    await new Promise((r) => setTimeout(r, 2000))
  }

  if (all.length === 0) {
    console.error('No records imported — check network / Overpass availability.')
    process.exit(1)
  }

  const outPath = join(process.cwd(), 'data', 'osm-import.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ locations: all }, null, 1))
  console.log(`\nWrote ${all.length} locations to ${outPath}`)
  console.log('Restart the app with OJOS_RESEED=1 (or on an empty database) to load them.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
