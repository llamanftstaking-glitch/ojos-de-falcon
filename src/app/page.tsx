'use client'

import dynamic from 'next/dynamic'
import { useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import {
  useGeolocation,
  useNearbySafety,
  useNavigationProgress,
  useDarkModeSync,
  useWakeLock,
  useVoiceCallouts,
  useTurnCallouts,
  speak,
} from '@/components/hooks'
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
import DrivingHUD from '@/components/DrivingHUD'
import WelcomeCard from '@/components/WelcomeCard'
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
  useWakeLock()
  useVoiceCallouts()
  useTurnCallouts()

  const sheet = useAppStore((s) => s.sheet)
  const setSheet = useAppStore((s) => s.setSheet)
  const navigating = useAppStore((s) => s.navigating)
  const userLocation = useAppStore((s) => s.userLocation)
  const darkMode = useAppStore((s) => s.darkMode)
  const setDarkMode = useAppStore((s) => s.setDarkMode)
  const driving = useAppStore((s) => s.driving)
  const setDriving = useAppStore((s) => s.setDriving)

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
    useAppStore.getState().setDriving(false)
    useAppStore.getState().setSheet({ kind: 'closed' })
    recenter(useAppStore.getState().userLocation)
  }, [])

  return (
    <main className="relative h-full w-full overflow-hidden bg-surface">
      <MapView />

      {/* Top chrome: search + safety controls. Hidden while navigating AND
          while driving — the DrivingHUD owns the top-left corner then, and
          drivers shouldn't be typing. STOP DRIVING brings search back. */}
      {!navigating && !driving && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <SearchBar onPickDestination={startRouteTo} />
          <SafetyControls />
        </div>
      )}

      {/* Right-side floating buttons — every control says what it does in words.
          During navigation only SOS stays (lifted above the trip bar). */}
      <div className={`pointer-events-none absolute right-3 z-20 flex flex-col items-end gap-3 ${navigating ? 'bottom-44' : 'bottom-28'}`}>
        {!navigating && (<>
        <button
          type="button"
          aria-label={darkMode ? 'Switch to light colors' : 'Switch to dark colors'}
          onClick={() => setDarkMode(!darkMode)}
          className="press pointer-events-auto flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface-raised shadow-float"
        >
          <span className="text-xl leading-none">{darkMode ? '☀' : '☾'}</span>
          <span className="text-[11px] font-bold tracking-wide text-ink-muted">{darkMode ? 'LIGHT' : 'DARK'}</span>
        </button>
        <button
          type="button"
          aria-label="Center the map on where you are"
          onClick={() => {
            useAppStore.getState().setFollow(true)
            recenter(userLocation)
          }}
          disabled={!userLocation}
          className="press pointer-events-auto flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl border border-line bg-surface-raised text-safety shadow-float disabled:opacity-40"
        >
          <span className="text-xl leading-none">◎</span>
          <span className="text-[11px] font-bold tracking-wide">FIND ME</span>
        </button>
        <button
          type="button"
          aria-label={driving ? 'Stop driving mode' : 'Start driving mode — the falcon watches the road with you'}
          onClick={() => {
            const next = !driving
            setDriving(next)
            if (next) {
              if (userLocation) flyTo(userLocation, 16.5)
              if (useAppStore.getState().voiceOn) speak('Falcon vision engaged.')
            }
          }}
          disabled={!userLocation}
          className={`press pointer-events-auto flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl border shadow-float disabled:opacity-40 ${
            driving ? 'border-falcon bg-falcon/15 text-falcon' : 'border-line bg-surface-raised text-falcon'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
            <path d="M32 3 C34.2 8.5 35.2 12.5 35.2 17.5 L56 29.5 C58.2 30.8 59.5 32.6 59.5 35 L59.5 39 L36.5 31.5 L35.5 43.5 L43.5 50 L43.5 55 L33.8 51.2 L32 47.5 L30.2 51.2 L20.5 55 L20.5 50 L28.5 43.5 L27.5 31.5 L4.5 39 L4.5 35 C4.5 32.6 5.8 30.8 8 29.5 L28.8 17.5 C28.8 12.5 29.8 8.5 32 3 Z" />
          </svg>
          <span className="text-[11px] font-bold tracking-wide">{driving ? 'STOP' : 'DRIVE'}</span>
        </button>
        </>)}
        <SOSButton />
      </div>

      {/* Bottom trigger: safety panel (hidden during navigation) */}
      {!navigating && sheet.kind === 'closed' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setSheet({ kind: 'nearby' })}
            className="press pointer-events-auto w-full max-w-xl rounded-2xl border border-line bg-surface-raised px-4 py-4 text-center shadow-float"
          >
            <span className="mx-auto mb-1.5 block h-1.5 w-12 rounded-full bg-ink-faint/50" />
            <span className="text-base font-bold uppercase tracking-wide text-ink">Safety near you</span>
          </button>
        </div>
      )}

      {/* Navigation UI */}
      {navigating && <NavigationChrome onEnd={endNavigation} />}

      {/* Falcon Vision driving HUD */}
      {driving && <DrivingHUD />}

      {/* One-time first-run explainer */}
      <WelcomeCard />

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
              const state = useAppStore.getState()
              state.setNavigating(true)
              // Navigation is driving: engage Falcon Vision automatically.
              state.setDriving(true)
              setSheet({ kind: 'closed' })
              if (state.voiceOn) speak('Falcon vision engaged. Route active.')
              const loc = state.userLocation
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
