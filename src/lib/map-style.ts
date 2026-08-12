import type { StyleSpecification } from 'maplibre-gl'

/**
 * Map provider abstraction. The product must never be locked to one map
 * vendor: styles are produced here, overridable via env, and everything
 * else in the app talks to MapLibre GL (an open renderer) only.
 *
 * Defaults use OpenFreeMap's keyless vector styles (OSM data, CORS-open,
 * no usage caps — CARTO's keyless raster basemaps were shut down and now
 * 404/CORS-block third-party origins). Override via
 * NEXT_PUBLIC_MAP_STYLE_LIGHT / _DARK with any MapLibre style URL
 * (MapTiler, Mapbox-compatible, self-hosted tiles, …).
 */

const OPENFREEMAP_LIGHT = 'https://tiles.openfreemap.org/styles/liberty'
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark'

export function getMapStyle(dark: boolean): string | StyleSpecification {
  const override = dark
    ? process.env.NEXT_PUBLIC_MAP_STYLE_DARK
    : process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT
  if (override) return override
  return dark ? OPENFREEMAP_DARK : OPENFREEMAP_LIGHT
}
