'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection, Point } from 'geojson'
import { getMapStyle } from '@/lib/map-style'
import { renderMarkerIcon, markerIconId } from '@/lib/marker-icons'
import { createFalconElement } from '@/lib/falcon-marker'
import { ALL_CATEGORIES, categoriesInGroup, CATEGORIES } from '@/lib/categories'
import { fetchLocationsInBBox, fetchLocation } from '@/lib/client-api'
import { haversineMeters } from '@/lib/geo'
import { useAppStore } from '@/store/app-store'
import { registerMap } from './map-controller'
import type { SafetyLocation } from '@/lib/types'

const DEFAULT_CENTER: [number, number] = [-73.9712, 40.7831] // NYC — MVP demo region
const DEFAULT_ZOOM = 12

const SOURCE_ID = 'safety-locations'
const ROUTE_SOURCE_ID = 'active-route'

function toFeatureCollection(locations: SafetyLocation[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: locations.map((loc) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.longitude, loc.latitude] },
      properties: {
        id: loc.id,
        name: loc.name,
        category: loc.category,
        icon: markerIconId(loc.category),
        tier: CATEGORIES[loc.category]?.tier ?? 3,
      },
    })),
  }
}

/**
 * The map IS the product: full-screen MapLibre canvas, clustered safety
 * markers, user location, and the active route. All overlay UI lives in
 * sibling components.
 */
export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const safetyMode = useAppStore((s) => s.safetyMode)
  const filterGroup = useAppStore((s) => s.filterGroup)
  const darkMode = useAppStore((s) => s.darkMode)
  const route = useAppStore((s) => s.route)
  const userLocation = useAppStore((s) => s.userLocation)
  const userHeading = useAppStore((s) => s.userHeading)
  const driving = useAppStore((s) => s.driving)
  const follow = useAppStore((s) => s.follow)
  const driveView = useAppStore((s) => s.driveView)
  const speedMps = useAppStore((s) => s.speedMps)

  function scheduleFetch() {
    if (fetchTimer.current) clearTimeout(fetchTimer.current)
    fetchTimer.current = setTimeout(refreshLocations, 250)
  }

  async function refreshLocations() {
    const map = mapRef.current
    if (!map || !map.getSource(SOURCE_ID)) return
    const state = useAppStore.getState()
    if (!state.safetyMode) {
      ;(map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(toFeatureCollection([]))
      return
    }
    const bounds = map.getBounds()
    try {
      const locations = await fetchLocationsInBBox(
        {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        map.getZoom(),
        state.filterGroup === 'all' ? undefined : categoriesInGroup(state.filterGroup)
      )
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      source?.setData(toFeatureCollection(locations))
    } catch {
      // Offline — keep whatever is already rendered rather than blanking the map.
    }
  }

  // --- map init -----------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(useAppStore.getState().darkMode),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    registerMap(map)

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.touchZoomRotate.enableRotation()

    map.on('load', () => {
      addSafetyLayers(map)
      addRouteLayers(map)
      scheduleFetch()
    })
    map.on('moveend', scheduleFetch)

    // Manual pan while driving breaks the chase cam; the recenter button
    // (or re-toggling Falcon Vision) re-engages it.
    map.on('dragstart', () => {
      const s = useAppStore.getState()
      if (s.driving && s.follow) s.setFollow(false)
    })

    map.on('click', 'safety-points', async (e) => {
      const feature = e.features?.[0]
      const id = feature?.properties?.id
      if (!id) return
      try {
        const location = await fetchLocation(String(id))
        useAppStore.getState().setSheet({ kind: 'detail', location })
      } catch {
        // Detail fetch failed (offline) — leave the map as-is.
      }
    })
    map.on('click', 'safety-clusters', async (e) => {
      const feature = e.features?.[0]
      if (!feature) return
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource
      const zoom = await source.getClusterExpansionZoom(feature.properties?.cluster_id)
      map.easeTo({ center: (feature.geometry as Point).coordinates as [number, number], zoom })
    })
    for (const layer of ['safety-points', 'safety-clusters']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }

    return () => {
      registerMap(null)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- style switch on theme change --------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(getMapStyle(darkMode) as any)
    map.once('styledata', () => {
      addSafetyLayers(map)
      addRouteLayers(map)
      if (useAppStore.getState().driving) addBuildingLayer(map)
      scheduleFetch()
      const s = useAppStore.getState()
      syncRoute(map, s.route?.geometry ?? null, s.navigating ? s.progressMeters : 0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode])

  // --- data refresh on filter changes -------------------------------------
  useEffect(() => {
    scheduleFetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safetyMode, filterGroup])

  // --- route layer sync (traveled portion drawn dimmed) --------------------
  const progressMeters = useAppStore((s) => s.progressMeters)
  const navigating = useAppStore((s) => s.navigating)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncRoute(map, route?.geometry ?? null, navigating ? progressMeters : 0)
  }, [route, progressMeters, navigating])

  // --- user location marker: the gold falcon -------------------------------
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!userLocation) {
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      return
    }
    if (!userMarkerRef.current) {
      // rotationAlignment 'map': the falcon rotates with true bearing, so in
      // heading-up driving mode it always points up the screen.
      userMarkerRef.current = new maplibregl.Marker({
        element: createFalconElement(),
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat(userLocation)
        .setRotation(userHeading ?? 0)
        .addTo(map)
    } else {
      userMarkerRef.current.setLngLat(userLocation)
      userMarkerRef.current.setRotation(userHeading ?? 0)
    }
  }, [userLocation, userHeading])

  // --- Falcon Vision cameras -----------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !driving) return
    if (driveView === 'overview') {
      // One-shot: frame the whole route (or pull back over the falcon).
      if (route && route.geometry.length >= 2) {
        let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
        for (const [lng, lat] of route.geometry) {
          west = Math.min(west, lng); south = Math.min(south, lat)
          east = Math.max(east, lng); north = Math.max(north, lat)
        }
        map.fitBounds(
          [[west, south], [east, north]],
          { padding: { top: 140, bottom: 160, left: 48, right: 48 }, pitch: 0, bearing: 0, duration: 900 }
        )
      } else if (userLocation) {
        map.easeTo({ center: userLocation, zoom: 13, pitch: 0, bearing: 0, duration: 900 })
      }
      return
    }
    if (!follow || !userLocation) return
    if (driveView === 'north') {
      map.easeTo({ center: userLocation, bearing: 0, pitch: 0, zoom: 16, duration: 900, essential: true })
      return
    }
    // Chase view: heading-up, tilted, zoom eases out as speed rises so the
    // driver sees further down the road.
    const speed = speedMps ?? 0
    const zoom = 17 - Math.min(Math.max(speed, 0), 27) / 27 * 1.8
    map.easeTo({
      center: userLocation,
      bearing: userHeading ?? map.getBearing(),
      pitch: 58,
      zoom,
      duration: 900,
      essential: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driving, follow, driveView, userLocation, userHeading, speedMps])

  // 3D buildings while driving; settle flat when leaving driving mode.
  const wasDriving = useRef(false)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (driving) {
      if (map.isStyleLoaded()) addBuildingLayer(map)
      else map.once('styledata', () => addBuildingLayer(map))
    } else {
      removeBuildingLayer(map)
      if (wasDriving.current) map.easeTo({ pitch: 0, bearing: 0, duration: 700 })
    }
    wasDriving.current = driving
  }, [driving])

  // h-full/w-full, not just absolute inset-0: maplibre-gl.css forces
  // .maplibregl-map to position:relative, which voids inset sizing and
  // collapses the container to zero height.
  return <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-label="Map" role="application" />
}

function addSafetyLayers(map: maplibregl.Map) {
  if (map.getSource(SOURCE_ID)) return

  for (const category of ALL_CATEGORIES) {
    const id = markerIconId(category)
    if (!map.hasImage(id)) {
      const image = renderMarkerIcon(category)
      if (image) map.addImage(id, image, { pixelRatio: 2 })
    }
  }

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 46,
  })

  map.addLayer({
    id: 'safety-clusters',
    type: 'circle',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': 'rgba(37, 99, 235, 0.85)',
      'circle-stroke-color': 'rgba(255,255,255,0.9)',
      'circle-stroke-width': 2,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
    },
  })
  map.addLayer({
    id: 'safety-cluster-count',
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 12,
      'text-font': ['Noto Sans Bold'],
    },
    paint: { 'text-color': '#ffffff' },
  })
  map.addLayer({
    id: 'safety-points',
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.45, 13, 0.6, 16, 0.75],
      'icon-allow-overlap': true,
      // Tier-1 facilities win placement conflicts.
      'symbol-sort-key': ['get', 'tier'],
      'text-field': ['step', ['zoom'], '', 13, ['get', 'name']],
      'text-size': 12.5,
      'text-offset': [0, 1.6],
      'text-anchor': 'top',
      'text-optional': true,
      'text-font': ['Noto Sans Regular'],
    },
    paint: {
      'text-color': '#94a3b8',
      'text-halo-color': 'rgba(0,0,0,0.65)',
      'text-halo-width': 1,
    },
  })
}

function addRouteLayers(map: maplibregl.Map) {
  if (map.getSource(ROUTE_SOURCE_ID)) return
  map.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  // Google-style ribbon: cyan glow + white casing + bright cyan core for
  // the road ahead; the traveled portion renders dim gray.
  const remainingOnly = ['==', ['get', 'kind'], 'remaining'] as any
  map.addLayer(
    {
      id: 'route-glow',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      filter: remainingOnly,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': 'rgb(53, 223, 242)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 12, 16, 24],
        'line-opacity': 0.3,
        'line-blur': 6,
      },
    },
    'safety-clusters'
  )
  map.addLayer(
    {
      id: 'route-casing',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      filter: remainingOnly,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': 'rgba(255,255,255,0.95)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 9, 16, 14],
      },
    },
    'safety-clusters'
  )
  map.addLayer(
    {
      id: 'route-line',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      filter: remainingOnly,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': 'rgb(53, 223, 242)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5.5, 16, 10],
      },
    },
    'safety-clusters'
  )
  map.addLayer(
    {
      id: 'route-traveled',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'traveled'] as any,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': 'rgba(148, 163, 184, 0.55)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 9],
      },
    },
    'safety-clusters'
  )
}

const BUILDINGS_LAYER_ID = 'falcon-3d-buildings'

/**
 * Extruded buildings for the driving chase view — the Waze/Google-style 3D
 * city feel. Reads the basemap's own vector source (OpenMapTiles schema),
 * so it works with any style that carries a `building` source-layer.
 */
function addBuildingLayer(map: maplibregl.Map) {
  if (map.getLayer(BUILDINGS_LAYER_ID)) return
  const sources = map.getStyle().sources ?? {}
  const vectorSource = Object.keys(sources).find((k) => (sources[k] as { type?: string }).type === 'vector')
  if (!vectorSource) return
  try {
    map.addLayer(
      {
        id: BUILDINGS_LAYER_ID,
        type: 'fill-extrusion',
        source: vectorSource,
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': 'rgba(120, 132, 158, 0.75)',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.55,
        },
      },
      'route-glow'
    )
  } catch {
    // Style without a building layer — chase view still works, just flat.
  }
}

function removeBuildingLayer(map: maplibregl.Map) {
  try {
    if (map.getLayer(BUILDINGS_LAYER_ID)) map.removeLayer(BUILDINGS_LAYER_ID)
  } catch {
    // Style mid-swap — nothing to remove.
  }
}

function syncRoute(map: maplibregl.Map, geometry: [number, number][] | null, progressMeters = 0) {
  const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
  if (!source) return
  if (!geometry) {
    source.setData({ type: 'FeatureCollection', features: [] })
    return
  }
  const [traveled, remaining] = splitAtDistance(geometry, progressMeters)
  const features: GeoJSON.Feature[] = []
  if (traveled.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: traveled },
      properties: { kind: 'traveled' },
    })
  }
  if (remaining.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: remaining },
      properties: { kind: 'remaining' },
    })
  }
  source.setData({ type: 'FeatureCollection', features })
}

/** Split a polyline at a distance along it (meters). */
function splitAtDistance(line: [number, number][], meters: number): [[number, number][], [number, number][]] {
  if (meters <= 0) return [[], line]
  let acc = 0
  for (let i = 0; i < line.length - 1; i++) {
    const seg = haversineMeters(line[i], line[i + 1])
    if (acc + seg >= meters) {
      const t = seg > 0 ? (meters - acc) / seg : 0
      const cut: [number, number] = [
        line[i][0] + (line[i + 1][0] - line[i][0]) * t,
        line[i][1] + (line[i + 1][1] - line[i][1]) * t,
      ]
      return [[...line.slice(0, i + 1), cut], [cut, ...line.slice(i + 1)]]
    }
    acc += seg
  }
  return [line, []]
}
