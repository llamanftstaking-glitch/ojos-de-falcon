/**
 * Safety POI category system: identity, display, priority tier, and zoom
 * behavior for every category the platform understands.
 *
 * Tier 1 renders first and survives the lowest zoom levels; tier 3 appears
 * only when zoomed in. This is the map priority hierarchy — do not render
 * every point equally.
 */

export type SafetyCategory =
  | 'police'
  | 'sheriff'
  | 'state_police'
  | 'fire_station'
  | 'ems'
  | 'hospital'
  | 'emergency_room'
  | 'courthouse'
  | 'government'
  | 'shelter'
  | 'safe_place'
  | 'pharmacy'
  | 'urgent_care'

export interface CategoryDef {
  id: SafetyCategory
  label: string
  /** Short label for chips / compact bars. */
  shortLabel: string
  /** 1 = always visible first, 3 = high-zoom only. */
  tier: 1 | 2 | 3
  /** Minimum map zoom at which this category renders. */
  minZoom: number
  /** Marker glyph — simple symbol, never the only signal (color + shape too). */
  glyph: string
  /** Design token color role (resolved in CSS / marker renderer). */
  colorToken: 'police' | 'fire' | 'medical' | 'court' | 'government' | 'safe'
  /** Filter group used by the quick filters. */
  group: 'police' | 'fire' | 'medical' | 'courts' | 'government' | 'safe_places'
}

export const CATEGORIES: Record<SafetyCategory, CategoryDef> = {
  police: { id: 'police', label: 'Police', shortLabel: 'Police', tier: 1, minZoom: 8, glyph: '🛡', colorToken: 'police', group: 'police' },
  sheriff: { id: 'sheriff', label: 'Sheriff', shortLabel: 'Sheriff', tier: 2, minZoom: 10, glyph: '★', colorToken: 'police', group: 'police' },
  state_police: { id: 'state_police', label: 'State Police', shortLabel: 'State PD', tier: 2, minZoom: 10, glyph: '🛡', colorToken: 'police', group: 'police' },
  fire_station: { id: 'fire_station', label: 'Fire Station', shortLabel: 'Fire', tier: 1, minZoom: 8, glyph: '🔥', colorToken: 'fire', group: 'fire' },
  ems: { id: 'ems', label: 'EMS', shortLabel: 'EMS', tier: 1, minZoom: 10, glyph: '🚑', colorToken: 'medical', group: 'medical' },
  hospital: { id: 'hospital', label: 'Hospital', shortLabel: 'Hospital', tier: 1, minZoom: 8, glyph: '✚', colorToken: 'medical', group: 'medical' },
  emergency_room: { id: 'emergency_room', label: 'Emergency Room', shortLabel: 'ER', tier: 1, minZoom: 8, glyph: 'ER', colorToken: 'medical', group: 'medical' },
  courthouse: { id: 'courthouse', label: 'Courthouse', shortLabel: 'Court', tier: 2, minZoom: 11, glyph: '🏛', colorToken: 'court', group: 'courts' },
  government: { id: 'government', label: 'Government Building', shortLabel: 'Gov', tier: 3, minZoom: 12, glyph: '🏢', colorToken: 'government', group: 'government' },
  shelter: { id: 'shelter', label: 'Emergency Shelter', shortLabel: 'Shelter', tier: 2, minZoom: 11, glyph: '⌂', colorToken: 'safe', group: 'safe_places' },
  safe_place: { id: 'safe_place', label: 'Safe Place', shortLabel: 'Safe', tier: 2, minZoom: 12, glyph: '✓', colorToken: 'safe', group: 'safe_places' },
  pharmacy: { id: 'pharmacy', label: '24h Pharmacy', shortLabel: 'Pharmacy', tier: 3, minZoom: 13, glyph: '℞', colorToken: 'medical', group: 'medical' },
  urgent_care: { id: 'urgent_care', label: 'Urgent Care', shortLabel: 'Urgent', tier: 3, minZoom: 13, glyph: '✚', colorToken: 'medical', group: 'medical' },
}

export const ALL_CATEGORIES = Object.keys(CATEGORIES) as SafetyCategory[]

export function isSafetyCategory(value: string): value is SafetyCategory {
  return value in CATEGORIES
}

/** Categories visible at a given zoom level (priority thinning). */
export function categoriesForZoom(zoom: number): SafetyCategory[] {
  return ALL_CATEGORIES.filter((c) => zoom >= CATEGORIES[c].minZoom)
}

export type FilterGroup = CategoryDef['group'] | 'all'

export const FILTER_GROUPS: { id: FilterGroup; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'police', label: 'Police' },
  { id: 'fire', label: 'Fire' },
  { id: 'medical', label: 'Medical' },
  { id: 'courts', label: 'Courts' },
  { id: 'government', label: 'Government' },
  { id: 'safe_places', label: 'Safe Places' },
]

export function categoriesInGroup(group: FilterGroup): SafetyCategory[] {
  if (group === 'all') return ALL_CATEGORIES
  return ALL_CATEGORIES.filter((c) => CATEGORIES[c].group === group)
}

/** Facility priority used by ranking engines (higher = stronger safety destination). */
export const FACILITY_PRIORITY: Record<SafetyCategory, number> = {
  police: 1.0,
  fire_station: 0.9,
  emergency_room: 0.95,
  hospital: 0.85,
  ems: 0.75,
  sheriff: 0.8,
  state_police: 0.8,
  shelter: 0.6,
  safe_place: 0.55,
  courthouse: 0.4,
  government: 0.3,
  urgent_care: 0.45,
  pharmacy: 0.3,
}
