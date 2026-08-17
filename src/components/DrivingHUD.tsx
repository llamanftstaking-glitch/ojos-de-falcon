'use client'

import { useMemo } from 'react'
import { useAppStore } from '@/store/app-store'
import { CATEGORIES } from '@/lib/categories'
import { formatMiles } from '@/lib/geo'
import { flyTo } from './map-controller'
import { speak } from './hooks'

const HUD_GROUPS: { label: string; categories: string[] }[] = [
  { label: 'POLICE', categories: ['police', 'sheriff', 'state_police'] },
  { label: 'FIRE', categories: ['fire_station'] },
  { label: 'MED', categories: ['emergency_room', 'hospital'] },
]

/**
 * Falcon Vision HUD — everything a driver needs at a glance, nothing else.
 * Speedometer, live nearest-safety chips, voice toggle. Big targets, high
 * contrast; glanceable at arm's length on a dashboard mount.
 */
export default function DrivingHUD() {
  const speedMps = useAppStore((s) => s.speedMps)
  const nearby = useAppStore((s) => s.nearby)
  const navigating = useAppStore((s) => s.navigating)
  const voiceOn = useAppStore((s) => s.voiceOn)
  const setVoiceOn = useAppStore((s) => s.setVoiceOn)
  const setDriving = useAppStore((s) => s.setDriving)

  const mph = speedMps !== null ? Math.round(speedMps * 2.23694) : null

  const chips = useMemo(
    () =>
      HUD_GROUPS.map((g) => {
        const nearest = nearby
          .filter((r) => g.categories.includes(r.location.category))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)[0]
        return nearest ? { label: g.label, result: nearest } : null
      }).filter((x): x is NonNullable<typeof x> => x !== null),
    [nearby]
  )

  return (
    <>
      {/* Speedometer — bottom-left, out of the way of sheets and nav bar */}
      <div className="pointer-events-none absolute bottom-28 left-3 z-20">
        <div className="flex flex-col items-center rounded-2xl border border-falcon/40 bg-surface-raised/95 px-4 py-2.5 shadow-float backdrop-blur">
          <span className="text-3xl font-black tabular-nums leading-none text-ink">{mph ?? '—'}</span>
          <span className="mt-0.5 text-[10px] font-bold tracking-widest text-falcon">MPH</span>
        </div>
      </div>

      {/* Top-left controls: voice + end patrol (kept clear of nav banner center) */}
      <div className="pointer-events-auto absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex flex-col gap-2">
        {!navigating && (
          <button
            type="button"
            onClick={() => setDriving(false)}
            className="rounded-xl border border-falcon/50 bg-surface-raised/95 px-3 py-2 text-[11px] font-black tracking-wider text-falcon shadow-float backdrop-blur"
          >
            END PATROL
          </button>
        )}
        <button
          type="button"
          aria-label={voiceOn ? 'Mute voice callouts' : 'Enable voice callouts'}
          onClick={() => {
            const next = !voiceOn
            setVoiceOn(next)
            if (next) speak('Falcon voice on.')
          }}
          className={`rounded-xl border px-3 py-2 text-lg shadow-float backdrop-blur ${
            voiceOn
              ? 'border-falcon/50 bg-surface-raised/95 text-falcon'
              : 'border-line bg-surface-raised/95 text-ink-faint'
          }`}
        >
          {voiceOn ? '🔊' : '🔇'}
        </button>
      </div>

      {/* Live nearest-safety chips — hidden while navigating (NavigationChrome
          shows its own route-aware safety bar there) */}
      {!navigating && chips.length > 0 && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex w-full max-w-xl gap-2">
            {chips.map(({ label, result }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  flyTo([result.location.longitude, result.location.latitude], 15)
                  useAppStore.getState().setSheet({ kind: 'detail', location: result.location })
                }}
                className="flex flex-1 flex-col items-center rounded-xl border border-falcon/30 bg-surface-raised/95 px-2 py-2.5 shadow-float backdrop-blur"
              >
                <span className="text-[11px] font-black tracking-wider text-falcon">{label}</span>
                <span className="text-sm font-bold text-ink">{formatMiles(result.distanceMeters)}</span>
                <span className="max-w-full truncate text-[10px] text-ink-faint">
                  {CATEGORIES[result.location.category]?.shortLabel}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
