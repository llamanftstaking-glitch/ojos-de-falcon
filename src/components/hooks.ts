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
          pos.coords.heading ?? null,
          pos.coords.speed ?? null
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

/**
 * Falcon Vision: keep the screen awake while driving. Re-acquires the lock
 * when the tab becomes visible again (the OS releases it on background).
 */
export function useWakeLock() {
  const driving = useAppStore((s) => s.driving)

  useEffect(() => {
    if (!driving || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let disposed = false

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        // Low battery or unsupported — driving mode still works, screen may sleep.
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !disposed) acquire()
    }
    acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      lock?.release().catch(() => {})
    }
  }, [driving])
}

const VOICE_GROUPS: { spoken: string; categories: string[] }[] = [
  { spoken: 'Police', categories: ['police', 'sheriff', 'state_police'] },
  { spoken: 'Fire station', categories: ['fire_station'] },
  { spoken: 'Emergency room', categories: ['emergency_room'] },
  { spoken: 'Hospital', categories: ['hospital'] },
]

const CALLOUT_RANGE_M = 1300
const CALLOUT_COOLDOWN_MS = 5 * 60_000

function spokenDistance(meters: number): string {
  const miles = meters / 1609.344
  if (miles < 0.15) return 'right here'
  return `${miles.toFixed(1)} miles`
}

export function speak(text: string) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1
    u.lang = 'en-US'
    window.speechSynthesis.speak(u)
  } catch {
    // No voice available — HUD still shows everything visually.
  }
}

/**
 * Falcon Vision voice callouts: as safety infrastructure comes into range
 * while driving, announce the closest facility per group hands-free.
 * Per-location cooldown so the falcon doesn't repeat itself at every light.
 */
export function useVoiceCallouts() {
  const driving = useAppStore((s) => s.driving)
  const voiceOn = useAppStore((s) => s.voiceOn)
  const nearby = useAppStore((s) => s.nearby)
  const announced = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!driving || !voiceOn || nearby.length === 0) return
    const now = Date.now()
    for (const group of VOICE_GROUPS) {
      const hit = nearby
        .filter((r) => group.categories.includes(r.location.category) && r.distanceMeters <= CALLOUT_RANGE_M)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)[0]
      if (!hit) continue
      const last = announced.current.get(hit.location.id) ?? 0
      if (now - last < CALLOUT_COOLDOWN_MS) continue
      announced.current.set(hit.location.id, now)
      speak(`${group.spoken}, ${spokenDistance(hit.distanceMeters)}. ${hit.location.name}.`)
    }
  }, [driving, voiceOn, nearby])

  // Leaving driving mode: cut any queued speech immediately.
  useEffect(() => {
    if (driving) return
    try {
      window.speechSynthesis?.cancel()
    } catch {
      // Fine.
    }
  }, [driving])
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
