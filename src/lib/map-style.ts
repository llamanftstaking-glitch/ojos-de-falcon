import type { StyleSpecification } from 'maplibre-gl'

/**
 * Map provider abstraction. The product must never be locked to one map
 * vendor: styles are produced here, overridable via env, and everything
 * else in the app talks to MapLibre GL (an open renderer) only.
 *
 * Defaults use CARTO's raster basemaps (OSM data) which are keyless.
 * For production traffic, set NEXT_PUBLIC_MAP_STYLE_LIGHT / _DARK to a
 * vector style URL from your chosen provider (MapTiler, Mapbox-compatible,
 * self-hosted tiles, …) and MapLibre will consume it unchanged.
 */

const CARTO_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'

function rasterStyle(tileUrls: string[]): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: tileUrls,
        tileSize: 256,
        attribution: CARTO_ATTRIBUTION,
        maxzoom: 20,
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  }
}

function cartoTiles(theme: 'dark_all' | 'voyager'): string[] {
  return ['a', 'b', 'c', 'd'].map(
    (s) => `https://${s}.basemaps.cartocdn.com/${theme}/{z}/{x}/{y}{r}.png`.replace('{r}', '')
  )
}

export function getMapStyle(dark: boolean): string | StyleSpecification {
  const override = dark
    ? process.env.NEXT_PUBLIC_MAP_STYLE_DARK
    : process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT
  if (override) return override
  return rasterStyle(cartoTiles(dark ? 'dark_all' : 'voyager'))
}
