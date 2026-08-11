import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { countLocations, bulkUpsert, findDuplicateCandidate, type UpsertInput } from './locations'
import { isSafetyCategory } from './categories'

const seedRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().refine(isSafetyCategory),
  subcategory: z.string().nullish(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  zip: z.string().nullish(),
  country: z.string().default('US'),
  phone: z.string().nullish(),
  nonEmergencyPhone: z.string().nullish(),
  website: z.string().nullish(),
  hours: z.string().nullish(),
  is24Hours: z.boolean().nullish(),
  verification: z
    .enum(['verified_official', 'verified_community', 'unverified', 'needs_review', 'temporarily_closed', 'permanently_closed'])
    .default('unverified'),
  source: z.string().default('seed-demo'),
  sourceAttribution: z.string().nullish(),
  lastVerified: z.string().nullish(),
  jurisdiction: z.string().nullish(),
  services: z.array(z.string()).default([]),
  accessibility: z.string().nullish(),
  parking: z.string().nullish(),
  publicEntrance: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

const seedFileSchema = z.object({ locations: z.array(seedRecordSchema) })

const SEED_ATTRIBUTION = 'Curated demo seed — approximate locations, unverified. Do not rely on details.'
const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)'

let seeded = false

/**
 * Loads seed data on first run (empty database). Files:
 *   data/osm-import.json  — output of `pnpm import:osm` (real OSM data), preferred
 *   data/seed-locations.json — curated demo fallback
 * Set OJOS_RESEED=1 to force re-loading on next boot.
 */
export function ensureSeeded(): void {
  if (seeded) return
  seeded = true
  const force = process.env.OJOS_RESEED === '1'
  if (!force && countLocations() > 0) return

  const files: { path: string; source: string; attribution: string }[] = [
    { path: join(process.cwd(), 'data', 'osm-import.json'), source: 'osm', attribution: OSM_ATTRIBUTION },
    { path: join(process.cwd(), 'data', 'seed-locations.json'), source: 'seed-demo', attribution: SEED_ATTRIBUTION },
  ]

  for (const file of files) {
    // Seed files ship alongside the server (see Dockerfile) — exclude from
    // build tracing so the whole project isn't pulled into standalone output.
    if (!existsSync(/*turbopackIgnore: true*/ file.path)) continue
    let parsed
    try {
      parsed = seedFileSchema.parse(JSON.parse(readFileSync(/*turbopackIgnore: true*/ file.path, 'utf8')))
    } catch (err) {
      console.error(`[bootstrap] Invalid seed file ${file.path}:`, err)
      continue
    }
    const inputs: UpsertInput[] = []
    for (const record of parsed.locations) {
      const input: UpsertInput = {
        id: record.id,
        name: record.name,
        category: record.category as UpsertInput['category'],
        subcategory: record.subcategory ?? null,
        latitude: record.latitude,
        longitude: record.longitude,
        address: record.address ?? null,
        city: record.city ?? null,
        state: record.state ?? null,
        zip: record.zip ?? null,
        country: record.country,
        phone: record.phone ?? null,
        nonEmergencyPhone: record.nonEmergencyPhone ?? null,
        website: record.website ?? null,
        hours: record.hours ?? null,
        is24Hours: record.is24Hours ?? null,
        verification: record.verification,
        source: record.source || file.source,
        sourceAttribution: record.sourceAttribution ?? file.attribution,
        lastVerified: record.lastVerified ?? null,
        jurisdiction: record.jurisdiction ?? null,
        services: record.services,
        accessibility: record.accessibility ?? null,
        parking: record.parking ?? null,
        publicEntrance: record.publicEntrance ?? null,
        metadata: record.metadata as Record<string, unknown>,
      }
      // Cross-source dedupe: skip records that already exist under another id.
      const dupe = findDuplicateCandidate(input)
      if (dupe && dupe.id !== input.id) continue
      inputs.push(input)
    }
    if (inputs.length > 0) {
      bulkUpsert(inputs)
      console.log(`[bootstrap] Loaded ${inputs.length} safety locations from ${file.path}`)
    }
  }
}
