'use client'

import type maplibregl from 'maplibre-gl'
import type { LngLat } from '@/lib/geo'

/**
 * Imperative bridge to the live map instance so panels/buttons can fly the
 * camera without prop-drilling the map object through the tree.
 */
let map: maplibregl.Map | null = null

export function registerMap(instance: maplibregl.Map | null): void {
  map = instance
}

export function flyTo(center: LngLat, zoom = 15): void {
  map?.flyTo({ center, zoom, duration: 900, essential: true })
}

export function fitRoute(geometry: LngLat[]): void {
  if (!map || geometry.length < 2) return
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  for (const [lng, lat] of geometry) {
    west = Math.min(west, lng); south = Math.min(south, lat)
    east = Math.max(east, lng); north = Math.max(north, lat)
  }
  map.fitBounds(
    [[west, south], [east, north]],
    { padding: { top: 96, bottom: 260, left: 48, right: 48 }, duration: 900 }
  )
}

export function recenter(userLocation: LngLat | null): void {
  if (userLocation) flyTo(userLocation, 15)
}
