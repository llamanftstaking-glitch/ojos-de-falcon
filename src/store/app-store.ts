'use client'

import { create } from 'zustand'
import type { SafetyLocation, NearbyResult, RouteSafetyResult, SafeDestinationCandidate } from '@/lib/types'
import type { Route } from '@/lib/routing/types'
import type { LngLat } from '@/lib/geo'
import type { FilterGroup } from '@/lib/categories'
import type { RouteSafetySummary } from '@/lib/route-safety'

export type LocationPermission = 'unknown' | 'granted' | 'denied' | 'unavailable'

export type SheetView =
  | { kind: 'closed' }
  | { kind: 'nearby' }
  | { kind: 'detail'; location: SafetyLocation }
  | { kind: 'route-preview' }
  | { kind: 'safe-destinations'; candidates: SafeDestinationCandidate[] }
  | { kind: 'sos' }

interface AppState {
  // Location
  userLocation: LngLat | null
  userHeading: number | null
  /** GPS ground speed in m/s (null when the device doesn't report it). */
  speedMps: number | null
  locationPermission: LocationPermission

  // Falcon Vision — driving mode
  driving: boolean
  /** Camera chases the falcon; panning the map manually breaks the chase. */
  follow: boolean
  voiceOn: boolean

  // Safety layer
  safetyMode: boolean
  filterGroup: FilterGroup

  // Nearby panel data
  nearby: NearbyResult[]
  nearbyOffline: boolean
  nearbySavedAt: number | null

  // Routing / navigation
  destination: { name: string; lngLat: LngLat } | null
  route: Route | null
  routeSafety: RouteSafetyResult[]
  routeSummary: RouteSafetySummary | null
  navigating: boolean
  /** Traveler progress along route in meters (updated from GPS while navigating). */
  progressMeters: number

  // UI
  sheet: SheetView
  darkMode: boolean

  setUserLocation: (loc: LngLat | null, heading?: number | null, speedMps?: number | null) => void
  setLocationPermission: (p: LocationPermission) => void
  setDriving: (on: boolean) => void
  setFollow: (on: boolean) => void
  setVoiceOn: (on: boolean) => void
  setSafetyMode: (on: boolean) => void
  setFilterGroup: (g: FilterGroup) => void
  setNearby: (results: NearbyResult[], offline: boolean, savedAt: number | null) => void
  setDestination: (d: { name: string; lngLat: LngLat } | null) => void
  setRoute: (route: Route | null) => void
  setRouteSafety: (results: RouteSafetyResult[], summary: RouteSafetySummary | null) => void
  setNavigating: (on: boolean) => void
  setProgress: (meters: number) => void
  setSheet: (view: SheetView) => void
  setDarkMode: (dark: boolean) => void
  clearRoute: () => void
}

export const useAppStore = create<AppState>((set) => ({
  userLocation: null,
  userHeading: null,
  speedMps: null,
  locationPermission: 'unknown',
  driving: false,
  follow: true,
  voiceOn: true,
  safetyMode: true,
  filterGroup: 'all',
  nearby: [],
  nearbyOffline: false,
  nearbySavedAt: null,
  destination: null,
  route: null,
  routeSafety: [],
  routeSummary: null,
  navigating: false,
  progressMeters: 0,
  sheet: { kind: 'closed' },
  darkMode: true,

  setUserLocation: (loc, heading = null, speedMps = null) =>
    set((s) => ({
      userLocation: loc,
      // GPS heading goes null/NaN when stationary — keep the last known one
      // so the falcon doesn't snap back to north at every red light.
      userHeading:
        heading !== null && heading !== undefined && !Number.isNaN(heading) ? heading : s.userHeading,
      speedMps: speedMps !== undefined && speedMps !== null && !Number.isNaN(speedMps) ? speedMps : null,
    })),
  setLocationPermission: (locationPermission) => set({ locationPermission }),
  setDriving: (driving) => set(driving ? { driving, follow: true } : { driving }),
  setFollow: (follow) => set({ follow }),
  setVoiceOn: (voiceOn) => set({ voiceOn }),
  setSafetyMode: (safetyMode) => set({ safetyMode }),
  setFilterGroup: (filterGroup) => set({ filterGroup }),
  setNearby: (nearby, nearbyOffline, nearbySavedAt) =>
    set({ nearby, nearbyOffline, nearbySavedAt }),
  setDestination: (destination) => set({ destination }),
  setRoute: (route) => set({ route }),
  setRouteSafety: (routeSafety, routeSummary) => set({ routeSafety, routeSummary }),
  setNavigating: (navigating) => set({ navigating }),
  setProgress: (progressMeters) => set({ progressMeters }),
  setSheet: (sheet) => set({ sheet }),
  setDarkMode: (darkMode) => set({ darkMode }),
  clearRoute: () =>
    set({
      destination: null,
      route: null,
      routeSafety: [],
      routeSummary: null,
      navigating: false,
      progressMeters: 0,
    }),
}))
