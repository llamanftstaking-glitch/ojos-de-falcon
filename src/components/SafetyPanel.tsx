'use client'

import { useAppStore } from '@/store/app-store'
import { CATEGORIES } from '@/lib/categories'
import { formatMiles } from '@/lib/geo'
import { fetchSafeDestinations } from '@/lib/client-api'
import { flyTo } from './map-controller'
import VerificationBadge from './VerificationBadge'

/**
 * "SAFETY NEAR YOU" panel — the swipe-up sheet content listing nearest
 * safety infrastructure with distance and ETA, plus the primary actions.
 */
export default function SafetyPanel() {
  const nearby = useAppStore((s) => s.nearby)
  const nearbyOffline = useAppStore((s) => s.nearbyOffline)
  const nearbySavedAt = useAppStore((s) => s.nearbySavedAt)
  const userLocation = useAppStore((s) => s.userLocation)
  const locationPermission = useAppStore((s) => s.locationPermission)
  const setSheet = useAppStore((s) => s.setSheet)

  async function takeMeSomewhereSafe() {
    if (!userLocation) return
    try {
      const candidates = await fetchSafeDestinations(userLocation)
      setSheet({ kind: 'safe-destinations', candidates })
    } catch {
      setSheet({ kind: 'safe-destinations', candidates: [] })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink">Safety near you</h2>
        {nearbyOffline && nearbySavedAt && (
          <span className="rounded bg-hazard/15 px-2 py-0.5 text-[11px] font-medium text-hazard">
            Offline data · {timeAgo(nearbySavedAt)}
          </span>
        )}
      </div>

      {locationPermission === 'denied' && (
        <p className="rounded-xl bg-surface-overlay p-3 text-sm text-ink-muted">
          Location access is off. You can still search and browse the map — enable location in your
          browser settings to see safety resources near you.
        </p>
      )}

      {locationPermission !== 'denied' && nearby.length === 0 && (
        <p className="rounded-xl bg-surface-overlay p-3 text-sm text-ink-muted">
          {userLocation
            ? 'Looking for safety locations near you…'
            : 'Waiting for your location…'}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-line">
        {nearby.slice(0, 6).map(({ location, distanceMeters, etaMinutes }) => (
          <li key={location.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 py-3 text-left hover:bg-surface-overlay"
              onClick={() => {
                flyTo([location.longitude, location.latitude], 15)
                useAppStore.getState().setSheet({ kind: 'detail', location })
              }}
            >
              <span aria-hidden className="w-6 text-center text-lg">
                {CATEGORIES[location.category]?.glyph}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{location.name}</span>
                <span className="block text-xs text-ink-muted">
                  {CATEGORIES[location.category]?.label} · {formatMiles(distanceMeters)} · ~{etaMinutes} min
                </span>
              </span>
              <VerificationBadge status={location.verification} compact />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-1 flex flex-col gap-2">
        <button
          type="button"
          onClick={takeMeSomewhereSafe}
          disabled={!userLocation}
          className="w-full rounded-xl bg-safety px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-float transition-opacity disabled:opacity-40"
        >
          Take me somewhere safe
        </button>
        {!userLocation && (
          <p className="text-center text-xs text-ink-faint">Needs your location to pick a safe destination.</p>
        )}
      </div>
    </div>
  )
}

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`
}
