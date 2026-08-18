'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { fetchNearby, fetchRoute, fetchRouteSafety } from '@/lib/client-api'
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
const OFF_ROUTE_METERS = 60
const REROUTE_COOLDOWN_MS = 12_000

export function useNavigationProgress() {
  const navigating = useAppStore((s) => s.navigating)
  const route = useAppStore((s) => s.route)
  const userLocation = useAppStore((s) => s.userLocation)
  const setProgress = useAppStore((s) => s.setProgress)
  const setRouteSafety = useAppStore((s) => s.setRouteSafety)
  const lastSafetyRefresh = useRef(0)
  const offRouteStreak = useRef(0)
  const rerouting = useRef(false)
  const lastReroute = useRef(0)

  useEffect(() => {
    if (!navigating || !route || !userLocation) return
    const projection = nearestPointOnLine(userLocation, route.geometry)
    setProgress(projection.alongMeters)

    // Waze-style recalculation: consistently far from the line → new route
    // from where the driver actually is. Two consecutive fixes avoid
    // rerouting on a single GPS jump.
    if (projection.distanceMeters > OFF_ROUTE_METERS) {
      offRouteStreak.current += 1
      const state = useAppStore.getState()
      const dest = state.destination
      if (
        offRouteStreak.current >= 2 &&
        !rerouting.current &&
        Date.now() - lastReroute.current > REROUTE_COOLDOWN_MS &&
        dest
      ) {
        rerouting.current = true
        lastReroute.current = Date.now()
        if (state.voiceOn) speak('Recalculating.')
        fetchRoute(userLocation, dest.lngLat)
          .then((fresh) => {
            const s = useAppStore.getState()
            if (!s.navigating) return
            s.setRoute(fresh)
            s.setProgress(0)
            fetchRouteSafety({ geometry: fresh.geometry, durationSeconds: fresh.durationSeconds })
              .then(({ results, summary }) => s.setRouteSafety(results, summary))
              .catch(() => {})
          })
          .catch(() => {
            // Provider unreachable — keep guiding along the old route.
          })
          .finally(() => {
            rerouting.current = false
            offRouteStreak.current = 0
          })
      }
    } else {
      offRouteStreak.current = 0
    }

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
 * Spoken turn-by-turn: announce the upcoming maneuver at ~a quarter mile
 * out and again right before the turn. One announcement per step per band.
 */
export function useTurnCallouts() {
  const navigating = useAppStore((s) => s.navigating)
  const voiceOn = useAppStore((s) => s.voiceOn)
  const route = useAppStore((s) => s.route)
  const progressMeters = useAppStore((s) => s.progressMeters)
  const spoken = useRef<Set<string>>(new Set())

  useEffect(() => {
    spoken.current.clear()
  }, [route])

  useEffect(() => {
    if (!navigating || !voiceOn || !route || route.approximate) return
    let cumulative = 0
    for (let i = 0; i < route.steps.length; i++) {
      const step = route.steps[i]
      const stepEnd = cumulative + step.distanceMeters
      if (stepEnd >= progressMeters) {
        const distanceToTurn = stepEnd - progressMeters
        const feet = Math.round(distanceToTurn * 3.28084)
        const next = route.steps[i + 1]
        const target = next ?? step
        const farKey = `${i}-far`
        const nearKey = `${i}-near`
        if (distanceToTurn < 420 && distanceToTurn > 90 && !spoken.current.has(farKey)) {
          spoken.current.add(farKey)
          speak(`In ${feet > 900 ? 'a quarter mile' : `${Math.round(feet / 100) * 100} feet`}, ${target.instruction}`)
        } else if (distanceToTurn <= 90 && !spoken.current.has(nearKey)) {
          spoken.current.add(nearKey)
          speak(target.instruction)
        }
        break
      }
      cumulative = stepEnd
    }
  }, [navigating, voiceOn, route, progressMeters])
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
