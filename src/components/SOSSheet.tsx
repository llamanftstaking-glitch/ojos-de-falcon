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
      <h2 className="text-center text-lg font-black uppercase tracking-widest text-emergency">Emergency</h2>
      <a
        href="tel:911"
        className="press w-full rounded-2xl bg-emergency px-4 py-6 text-center text-xl font-black uppercase tracking-wide text-white shadow-float"
      >
        📞 Call 911 now
      </a>
      <button
        type="button"
        onClick={() => navigateToNearest('police')}
        disabled={!userLocation}
        className="press w-full rounded-2xl border border-line bg-surface-overlay px-4 py-4 text-base font-bold text-ink disabled:opacity-40"
      >
        🚓 Take me to the nearest police
      </button>
      <button
        type="button"
        onClick={() => navigateToNearest('medical')}
        disabled={!userLocation}
        className="press w-full rounded-2xl border border-line bg-surface-overlay px-4 py-4 text-base font-bold text-ink disabled:opacity-40"
      >
        🏥 Take me to the nearest hospital
      </button>
      <button
        type="button"
        onClick={shareLocation}
        disabled={!userLocation}
        className="press w-full rounded-2xl border border-line bg-surface-overlay px-4 py-4 text-base font-bold text-ink disabled:opacity-40"
      >
        📍 Send my location to family
      </button>
      <button
        type="button"
        onClick={() => setSheet({ kind: 'closed' })}
        className="press w-full rounded-2xl px-4 py-4 text-base font-semibold text-ink-muted"
      >
        Cancel — I&apos;m okay
      </button>
      <p className="text-center text-xs text-ink-faint">
        Calls are placed by your device&apos;s dialer — you confirm before dialing. In the US the emergency number is 911.
      </p>
    </div>
  )
}
