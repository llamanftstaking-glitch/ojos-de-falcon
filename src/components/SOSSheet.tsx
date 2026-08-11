'use client'

import { useAppStore } from '@/store/app-store'
import { fetchNearby } from '@/lib/client-api'
import type { SafetyLocation } from '@/lib/types'

/**
 * SOS options. Emergency calling uses the OS dialer via tel: — the user
 * always confirms the call on their device. Nothing here pretends to
 * contact emergency services on its own.
 */
export default function SOSSheet({
  onNavigate,
}: {
  onNavigate: (loc: SafetyLocation) => void
}) {
  const userLocation = useAppStore((s) => s.userLocation)
  const setSheet = useAppStore((s) => s.setSheet)

  async function navigateToNearest(kind: 'police' | 'medical') {
    if (!userLocation) return
    const categories =
      kind === 'police'
        ? (['police', 'sheriff', 'state_police'] as const)
        : (['emergency_room', 'hospital'] as const)
    try {
      const { results } = await fetchNearby(userLocation, [...categories], 1)
      if (results[0]) onNavigate(results[0].location)
    } catch {
      // Offline with no cache — the button simply can't resolve a target.
    }
  }

  function shareLocation() {
    if (!userLocation) return
    const [lng, lat] = userLocation
    const text = `Emergency — my current location: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
    if (navigator.share) {
      navigator.share({ text }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(text).catch(() => {})
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-center text-sm font-bold uppercase tracking-widest text-emergency">Emergency</h2>
      <a
        href="tel:911"
        className="w-full rounded-xl bg-emergency px-4 py-4 text-center text-base font-black uppercase tracking-wide text-white shadow-float"
      >
        Call emergency services (911)
      </a>
      <button
        type="button"
        onClick={() => navigateToNearest('police')}
        disabled={!userLocation}
        className="w-full rounded-xl border border-line bg-surface-overlay px-4 py-3.5 text-sm font-bold text-ink disabled:opacity-40"
      >
        Navigate to nearest police
      </button>
      <button
        type="button"
        onClick={() => navigateToNearest('medical')}
        disabled={!userLocation}
        className="w-full rounded-xl border border-line bg-surface-overlay px-4 py-3.5 text-sm font-bold text-ink disabled:opacity-40"
      >
        Navigate to nearest hospital / ER
      </button>
      <button
        type="button"
        onClick={shareLocation}
        disabled={!userLocation}
        className="w-full rounded-xl border border-line bg-surface-overlay px-4 py-3.5 text-sm font-bold text-ink disabled:opacity-40"
      >
        Share my location
      </button>
      <button
        type="button"
        onClick={() => setSheet({ kind: 'closed' })}
        className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-ink-muted"
      >
        Cancel
      </button>
      <p className="text-center text-[11px] text-ink-faint">
        Calls are placed by your device&apos;s dialer — you confirm before dialing. In the US the emergency number is 911.
      </p>
    </div>
  )
}
