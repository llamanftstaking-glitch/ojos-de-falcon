'use client'

import dynamic from 'next/dynamic'
import { useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { useGeolocation, useNearbySafety, useNavigationProgress, useDarkModeSync } from '@/components/hooks'
import { fetchRoute, fetchRouteSafety } from '@/lib/client-api'
import { fitRoute, recenter, flyTo } from '@/components/map-controller'
import SearchBar from '@/components/SearchBar'
import SafetyControls from '@/components/SafetyControls'
import BottomSheet from '@/components/BottomSheet'
import SafetyPanel from '@/components/SafetyPanel'
import LocationDetailSheet from '@/components/LocationDetailSheet'
import RoutePreviewSheet from '@/components/RoutePreviewSheet'
import SafeDestinationsSheet from '@/components/SafeDestinationsSheet'
import SOSButton from '@/components/SOSButton'
import SOSSheet from '@/components/SOSSheet'
import NavigationChrome from '@/components/NavigationChrome'
import type { SafetyLocation } from '@/lib/types'

// MapLibre needs the browser; render the map client-side only.
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-surface">
      <p className="text-sm text-ink-muted">Loading map…</p>
    </div>
  ),
})

export default function Home() {
  useDarkModeSync()
  useGeolocation()
  useNearbySafety()
  useNavigationProgress()

  const sheet = useAppStore((s) => s.sheet)
  const setSheet = useAppStore((s) => s.setSheet)
  const navigating = useAppStore((s) => s.navigating)
  const userLocation = useAppStore((s) => s.userLocation)
  const darkMode = useAppStore((s) => s.darkMode)
  const setDarkMode = useAppStore((s) => s.setDarkMode)

  const startRouteTo = useCallback(async (dest: { name: string; lngLat: [number, number] }) => {
    const state = useAppStore.getState()
    const origin = state.userLocation
    if (!origin) {
      // Without a GPS fix we can still show the destination.
      flyTo(dest.lngLat, 15)
      return
    }
    state.setDestination(dest)
    try {
      const route = await fetchRoute(origin, dest.lngLat)
      state.setRoute(route)
      fitRoute(route.geometry)
      state.setSheet({ kind: 'route-preview' })
      const { results, summary } = await fetchRouteSafety({
        geometry: route.geometry,
        durationSeconds: route.durationSeconds,
      })
      state.setRouteSafety(results, summary)
    } catch {
      state.clearRoute()
    }
  }, [])

  const navigateToLocation = useCallback(
    (loc: SafetyLocation) => {
      startRouteTo({ name: loc.name, lngLat: [loc.longitude, loc.latitude] })
    },
    [startRouteTo]
  )

  const endNavigation = useCallback(() => {
    useAppStore.getState().clearRoute()
    useAppStore.getState().setSheet({ kind: 'closed' })
    recenter(useAppStore.getState().userLocation)
  }, [])

  return (
    <main className="relative h-full w-full overflow-hidden bg-surface">
      <MapView />

      {/* Top chrome: search + safety controls (hidden during navigation) */}
      {!navigating && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <SearchBar onPickDestination={startRouteTo} />
          <SafetyControls />
        </div>
      )}

      {/* Right-side floating buttons */}
      <div className="pointer-events-none absolute bottom-28 right-3 z-20 flex flex-col items-end gap-3">
        <button
          type="button"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => setDarkMode(!darkMode)}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-raised text-lg shadow-float"
        >
          {darkMode ? '☀' : '☾'}
        </button>
        <button
          type="button"
          aria-label="Recenter map on your location"
          onClick={() => recenter(userLocation)}
          disabled={!userLocation}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-raised text-lg text-safety shadow-float disabled:opacity-40"
        >
          ◎
        </button>
        <SOSButton />
      </div>

      {/* Bottom trigger: safety panel (hidden during navigation) */}
      {!navigating && sheet.kind === 'closed' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setSheet({ kind: 'nearby' })}
            className="pointer-events-auto w-full max-w-xl rounded-2xl border border-line bg-surface-raised px-4 py-3 text-center shadow-float"
          >
            <span className="mx-auto mb-1.5 block h-1 w-10 rounded-full bg-ink-faint/50" />
            <span className="text-sm font-bold uppercase tracking-wide text-ink">Safety near you</span>
          </button>
        </div>
      )}

      {/* Navigation UI */}
      {navigating && <NavigationChrome onEnd={endNavigation} />}

      {/* Sheets */}
      <BottomSheet
        open={sheet.kind !== 'closed'}
        onClose={() => setSheet({ kind: 'closed' })}
        ariaLabel="Safety information"
      >
        {sheet.kind === 'nearby' && <SafetyPanel />}
        {sheet.kind === 'detail' && (
          <LocationDetailSheet location={sheet.location} onNavigate={navigateToLocation} />
        )}
        {sheet.kind === 'route-preview' && (
          <RoutePreviewSheet
            onStart={() => {
              useAppStore.getState().setNavigating(true)
              setSheet({ kind: 'closed' })
              const loc = useAppStore.getState().userLocation
              if (loc) flyTo(loc, 16)
            }}
            onCancel={endNavigation}
          />
        )}
        {sheet.kind === 'safe-destinations' && (
          <SafeDestinationsSheet candidates={sheet.candidates} onNavigate={navigateToLocation} />
        )}
        {sheet.kind === 'sos' && <SOSSheet onNavigate={navigateToLocation} />}
      </BottomSheet>
    </main>
  )
}
