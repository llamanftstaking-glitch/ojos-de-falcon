'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { fetchNearby, fetchRouteSafety } from '@/lib/client-api'
import { nearestPointOnLine } from '@/lib/geo'
import type { LngLat } from '@/lib/geo'

/**
 * Watches device geolocation. Never blocks the app when denied — the map
 * remains fully usable, and nearby queries fall back to the map center.
 */
export function useGeolocation() {
  const setUserLocation = useAppStore((s) => s.setUserLocation)
  const setLocationPermission = useAppStore((s) => s.setLocationPermission)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setLocationPermission('unavailable')
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationPermission('granted')
        setUserLocation(
          [pos.coords.longitude, pos.coords.latitude],
          pos.coords.heading ?? null
        )
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocationPermission('denied')
        else setLocationPermission('unavailable')
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [setUserLocation, setLocationPermission])
}

/** Refreshes the "Safety near you" data as the user moves. */
export function useNearbySafety() {
  const userLocation = useAppStore((s) => s.userLocation)
  const setNearby = useAppStore((s) => s.setNearby)
  const lastFetchedAt = useRef<LngLat | null>(null)

  useEffect(() => {
    if (!userLocation) return
    // Refetch only after meaningful movement (~250 m) to save battery/requests.
    const prev = lastFetchedAt.current
    if (prev) {
      const dLng = Math.abs(prev[0] - userLocation[0])
      const dLat = Math.abs(prev[1] - userLocation[1])
      if (dLng < 0.0025 && dLat < 0.0022) return
    }
    lastFetchedAt.current = userLocation
    fetchNearby(userLocation)
      .then(({ results, offline, savedAt }) => setNearby(results, offline, savedAt))
      .catch(() => {
        // No data and no cache — panel shows its empty state.
      })
  }, [userLocation, setNearby])
}

/**
 * While navigating: project the GPS position onto the route to track
 * progress, and refresh safety-along-route as progress advances.
 */
export function useNavigationProgress() {
  const navigating = useAppStore((s) => s.navigating)
  const route = useAppStore((s) => s.route)
  const userLocation = useAppStore((s) => s.userLocation)
  const setProgress = useAppStore((s) => s.setProgress)
  const setRouteSafety = useAppStore((s) => s.setRouteSafety)
  const lastSafetyRefresh = useRef(0)

  useEffect(() => {
    if (!navigating || !route || !userLocation) return
    const projection = nearestPointOnLine(userLocation, route.geometry)
    setProgress(projection.alongMeters)

    const now = Date.now()
    if (now - lastSafetyRefresh.current > 30_000) {
      lastSafetyRefresh.current = now
      fetchRouteSafety({
        geometry: route.geometry,
        progressMeters: projection.alongMeters,
        durationSeconds: route.durationSeconds,
      })
        .then(({ results, summary }) => setRouteSafety(results, summary))
        .catch(() => {})
    }
  }, [navigating, route, userLocation, setProgress, setRouteSafety])
}

export function useDarkModeSync() {
  const darkMode = useAppStore((s) => s.darkMode)
  const setDarkMode = useAppStore((s) => s.setDarkMode)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('odf-theme')
      const dark = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
      setDarkMode(dark)
    } catch {
      // Keep default.
    }
  }, [setDarkMode])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    try {
      localStorage.setItem('odf-theme', darkMode ? 'dark' : 'light')
    } catch {
      // Storage unavailable — theme just won't persist.
    }
  }, [darkMode])
}
