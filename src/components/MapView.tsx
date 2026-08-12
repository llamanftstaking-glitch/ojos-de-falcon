'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection, Point } from 'geojson'
import { getMapStyle } from '@/lib/map-style'
import { renderMarkerIcon, markerIconId } from '@/lib/marker-icons'
import { ALL_CATEGORIES, categoriesInGroup, CATEGORIES } from '@/lib/categories'
import { fetchLocationsInBBox, fetchLocation } from '@/lib/client-api'
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
      scheduleFetch()
      syncRoute(map, route?.geometry ?? null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode])

  // --- data refresh on filter changes -------------------------------------
  useEffect(() => {
    scheduleFetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safetyMode, filterGroup])

  // --- route layer sync ----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncRoute(map, route?.geometry ?? null)
  }, [route])

  // --- user location marker ------------------------------------------------
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
      const el = document.createElement('div')
      el.className = 'gps-pulse relative h-4 w-4 rounded-full border-2 border-white shadow-float'
      el.style.backgroundColor = 'rgb(37 99 235)'
      el.setAttribute('aria-label', 'Your location')
      userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(userLocation).addTo(map)
    } else {
      userMarkerRef.current.setLngLat(userLocation)
    }
  }, [userLocation])

  return <div ref={containerRef} className="absolute inset-0" aria-label="Map" role="application" />
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
      'text-size': 11,
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
  map.addLayer(
    {
      id: 'route-casing',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': 'rgba(255,255,255,0.9)', 'line-width': 9 },
    },
    'safety-clusters'
  )
  map.addLayer(
    {
      id: 'route-line',
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': 'rgb(37, 99, 235)', 'line-width': 5.5 },
    },
    'safety-clusters'
  )
}

function syncRoute(map: maplibregl.Map, geometry: [number, number][] | null) {
  const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
  if (!source) return
  source.setData(
    geometry
      ? {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'LineString', coordinates: geometry }, properties: {} },
          ],
        }
      : { type: 'FeatureCollection', features: [] }
  )
}
