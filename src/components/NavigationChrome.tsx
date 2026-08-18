'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { CATEGORIES } from '@/lib/categories'
import { formatMiles } from '@/lib/geo'
import { flyTo } from './map-controller'
import ManeuverArrow from './ManeuverArrow'
import { speak } from './hooks'
import type { Maneuver } from '@/lib/routing/types'

const ARRIVE_THRESHOLD_M = 45

/**
 * Active-navigation UI: instruction banner up top, and the Nearby Safety
 * Bar — police / fire / ER always one tap away without leaving navigation.
 * Driving-mode sizing: large text, large touch targets, minimal chrome.
 */
export default function NavigationChrome({ onEnd }: { onEnd: () => void }) {
  const route = useAppStore((s) => s.route)
  const destination = useAppStore((s) => s.destination)
  const progressMeters = useAppStore((s) => s.progressMeters)
  const routeSafety = useAppStore((s) => s.routeSafety)

  const current = useMemo(() => {
    if (!route) return null
    const remaining = Math.max(0, route.distanceMeters - progressMeters)
    const fraction = route.distanceMeters > 0 ? remaining / route.distanceMeters : 0
    const remainingSeconds = route.durationSeconds * fraction
    const eta = new Date(Date.now() + remainingSeconds * 1000)

    // Next instruction: first step whose cumulative start is ahead of progress.
    let nextInstruction: string | null = null
    let maneuver: Maneuver | undefined
    let distanceToStep = 0
    let cumulative = 0
    for (const step of route.steps) {
      if (cumulative + step.distanceMeters >= progressMeters) {
        nextInstruction = step.instruction
        maneuver = step.maneuver
        distanceToStep = Math.max(0, cumulative + step.distanceMeters - progressMeters)
        break
      }
      cumulative += step.distanceMeters
    }
    const arrived = remaining <= ARRIVE_THRESHOLD_M
    return { remaining, remainingSeconds, eta, nextInstruction, maneuver, distanceToStep, arrived }
  }, [route, progressMeters])

  // Announce arrival once per route.
  const announcedArrival = useRef(false)
  useEffect(() => {
    if (!current?.arrived) {
      announcedArrival.current = false
      return
    }
    if (!announcedArrival.current) {
      announcedArrival.current = true
      if (useAppStore.getState().voiceOn) speak('You have arrived.')
    }
  }, [current?.arrived])

  const safetyShortcuts = useMemo(() => {
    const groups: { label: string; categories: string[] }[] = [
      { label: 'POLICE', categories: ['police', 'sheriff', 'state_police'] },
      { label: 'FIRE', categories: ['fire_station'] },
      { label: 'ER', categories: ['emergency_room', 'hospital'] },
    ]
    return groups
      .map((g) => {
        const nearest = routeSafety.find(
          (r) => g.categories.includes(r.location.category) && r.distanceAheadMeters >= 0
        ) ?? routeSafety.find((r) => g.categories.includes(r.location.category))
        return nearest ? { label: g.label, result: nearest } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [routeSafety])

  if (!route || !current) return null

  return (
    <>
      {/* Instruction banner */}
      <div className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-xl rounded-2xl border border-line bg-surface-raised p-4 shadow-float">
          {current.arrived ? (
            <div className="flex items-center gap-4">
              <span aria-hidden className="text-4xl">🏁</span>
              <p className="text-2xl font-black leading-snug text-ink">
                You have arrived{destination?.name ? ` — ${destination.name}` : ''}
              </p>
            </div>
          ) : route.approximate ? (
            <p className="text-base font-medium text-hazard">
              Direct-path guidance — road directions unavailable. Head toward your destination.
            </p>
          ) : current.nextInstruction ? (
            <div className="flex items-center gap-4">
              <span className="shrink-0 rounded-2xl bg-falcon/15 p-2 text-falcon">
                <ManeuverArrow maneuver={current.maneuver} size={52} />
              </span>
              <div className="min-w-0">
                <p className="text-3xl font-black leading-none text-falcon">
                  {formatMiles(current.distanceToStep)}
                </p>
                <p className="mt-1 text-xl font-bold leading-snug text-ink">{current.nextInstruction}</p>
              </div>
            </div>
          ) : (
            <p className="text-2xl font-bold text-ink">Continue to {destination?.name ?? 'destination'}</p>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-base">
            <span className="font-semibold text-ink">
              ETA {current.eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
            <span className="text-ink-muted">
              {Math.max(1, Math.round(current.remainingSeconds / 60))} min · {formatMiles(current.remaining)}
            </span>
            <button
              type="button"
              onClick={onEnd}
              className="press rounded-xl bg-emergency/10 px-4 py-2.5 text-sm font-black uppercase text-emergency"
            >
              End
            </button>
          </div>
        </div>
      </div>

      {/* Nearby safety bar — never leave navigation to find help */}
      {safetyShortcuts.length > 0 && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex w-full max-w-xl gap-2">
            {safetyShortcuts.map(({ label, result }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  flyTo([result.location.longitude, result.location.latitude], 15)
                  useAppStore.getState().setSheet({ kind: 'detail', location: result.location })
                }}
                className="press flex flex-1 flex-col items-center rounded-xl border border-line bg-surface-raised px-2 py-3 shadow-float"
              >
                <span className="text-[13px] font-black tracking-wider text-safety">{label}</span>
                <span className="text-base font-bold text-ink">
                  {result.distanceAheadMeters >= 0 ? `${result.minutesAhead} min` : formatMiles(Math.abs(result.distanceAheadMeters))}
                </span>
                <span className="max-w-full truncate text-xs text-ink-faint">
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
