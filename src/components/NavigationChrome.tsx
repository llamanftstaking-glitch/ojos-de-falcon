'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { CATEGORIES } from '@/lib/categories'
import { formatMiles } from '@/lib/geo'
import { flyTo } from './map-controller'
import ManeuverArrow from './ManeuverArrow'
import { speak } from './hooks'
import type { Maneuver } from '@/lib/routing/types'

const ARRIVE_THRESHOLD_M = 45

/**
 * Active-navigation UI, Google-Maps-style: teal instruction banner with a
 * "Then" next-turn chip, a dark trip bar (yellow ETA + red Exit) that
 * expands into a menu, a full turn-by-turn Directions list, and a
 * Re-center pill when the chase cam is broken. Safety chips stay one tap
 * away — that's the product.
 */
export default function NavigationChrome({ onEnd }: { onEnd: () => void }) {
  const route = useAppStore((s) => s.route)
  const destination = useAppStore((s) => s.destination)
  const progressMeters = useAppStore((s) => s.progressMeters)
  const routeSafety = useAppStore((s) => s.routeSafety)
  const follow = useAppStore((s) => s.follow)
  const voiceOn = useAppStore((s) => s.voiceOn)
  const setVoiceOn = useAppStore((s) => s.setVoiceOn)
  const driveView = useAppStore((s) => s.driveView)
  const setDriveView = useAppStore((s) => s.setDriveView)
  const userLocation = useAppStore((s) => s.userLocation)

  const [menuOpen, setMenuOpen] = useState(false)
  const [directionsOpen, setDirectionsOpen] = useState(false)

  const current = useMemo(() => {
    if (!route) return null
    const remaining = Math.max(0, route.distanceMeters - progressMeters)
    const fraction = route.distanceMeters > 0 ? remaining / route.distanceMeters : 0
    const remainingSeconds = route.durationSeconds * fraction
    const eta = new Date(Date.now() + remainingSeconds * 1000)

    let nextInstruction: string | null = null
    let maneuver: Maneuver | undefined
    let thenManeuver: Maneuver | undefined
    let distanceToStep = 0
    let cumulative = 0
    for (let i = 0; i < route.steps.length; i++) {
      const step = route.steps[i]
      if (cumulative + step.distanceMeters >= progressMeters) {
        nextInstruction = step.instruction
        maneuver = step.maneuver
        thenManeuver = route.steps[i + 1]?.maneuver
        distanceToStep = Math.max(0, cumulative + step.distanceMeters - progressMeters)
        break
      }
      cumulative += step.distanceMeters
    }
    const arrived = remaining <= ARRIVE_THRESHOLD_M
    return { remaining, remainingSeconds, eta, nextInstruction, maneuver, thenManeuver, distanceToStep, arrived }
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

  function shareTrip() {
    const dest = destination?.name ?? 'my destination'
    const loc = userLocation
    const where = loc
      ? ` I'm here now: https://www.openstreetmap.org/?mlat=${loc[1]}&mlon=${loc[0]}#map=16/${loc[1]}/${loc[0]}`
      : ''
    const text = `On my way to ${dest} — arriving about ${current!.eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.${where}`
    if (navigator.share) navigator.share({ text }).catch(() => {})
    else navigator.clipboard?.writeText(text).catch(() => {})
    setMenuOpen(false)
  }

  return (
    <>
      {/* ---- Instruction banner (Google teal) ---- */}
      <div className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-xl rounded-3xl bg-[#0d4f52] p-4 shadow-float">
          {current.arrived ? (
            <div className="flex items-center gap-4">
              <span aria-hidden className="text-4xl">🏁</span>
              <p className="text-2xl font-black leading-snug text-white">
                You have arrived{destination?.name ? ` — ${destination.name}` : ''}
              </p>
            </div>
          ) : route.approximate ? (
            <p className="text-base font-medium text-amber-300">
              Direct-path guidance — head toward your destination.
            </p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex shrink-0 flex-col items-center text-white">
                <ManeuverArrow maneuver={current.maneuver} size={46} />
                <span className="mt-0.5 text-sm font-black tabular-nums">
                  {formatMiles(current.distanceToStep)}
                </span>
              </div>
              <p className="min-w-0 flex-1 text-2xl font-bold leading-tight text-white">
                {current.nextInstruction ?? `Continue to ${destination?.name ?? 'destination'}`}
              </p>
            </div>
          )}
        </div>
        {/* "Then" next-turn chip */}
        {!current.arrived && !route.approximate && current.thenManeuver && (
          <div className="flex w-full max-w-xl">
            <div className="flex items-center gap-2 rounded-2xl bg-[#0d4f52]/90 px-3.5 py-2 text-white shadow-float">
              <span className="text-sm font-bold">Then</span>
              <ManeuverArrow maneuver={current.thenManeuver} size={26} />
            </div>
          </div>
        )}
      </div>

      {/* ---- Right-side circles: voice + view ---- */}
      <div className="pointer-events-auto absolute right-3 top-[max(11rem,calc(env(safe-area-inset-top)+10rem))] z-20 flex flex-col gap-2.5">
        <button
          type="button"
          aria-label={voiceOn ? 'Turn voice off' : 'Turn voice on'}
          onClick={() => {
            const next = !voiceOn
            setVoiceOn(next)
            if (next) speak('Voice on.')
          }}
          className="press flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#171a1e]/95 text-xl text-white shadow-float backdrop-blur"
        >
          {voiceOn ? '🔊' : '🔇'}
        </button>
        <button
          type="button"
          aria-label="Change camera view"
          onClick={() => {
            const order = ['chase', 'north', 'overview'] as const
            setDriveView(order[(order.indexOf(driveView) + 1) % order.length])
          }}
          className="press flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#171a1e]/95 text-xl text-white shadow-float backdrop-blur"
        >
          {driveView === 'chase' ? '🛰' : driveView === 'north' ? '⬆' : '🗺'}
        </button>
      </div>

      {/* ---- Re-center pill ---- */}
      {!follow && driveView !== 'overview' && (
        <div className="pointer-events-auto absolute bottom-44 left-3 z-20">
          <button
            type="button"
            onClick={() => {
              const s = useAppStore.getState()
              s.setFollow(true)
              if (s.userLocation) flyTo(s.userLocation, 16.5)
            }}
            className="press flex items-center gap-2 rounded-full bg-[#171a1e]/95 px-5 py-3.5 text-base font-bold text-white shadow-float backdrop-blur"
          >
            <span aria-hidden>➤</span> Re-center
          </button>
        </div>
      )}

      {/* ---- Safety chips (slim, above trip bar) ---- */}
      {safetyShortcuts.length > 0 && !menuOpen && !directionsOpen && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-[6.5rem] z-20 flex justify-center px-3 pb-1">
          <div className="flex w-full max-w-xl gap-2">
            {safetyShortcuts.map(({ label, result }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  flyTo([result.location.longitude, result.location.latitude], 15)
                  useAppStore.getState().setSheet({ kind: 'detail', location: result.location })
                }}
                className="press flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#171a1e]/90 px-2 py-2 shadow-float backdrop-blur"
              >
                <span className="text-xs font-black tracking-wider text-falcon">{label}</span>
                <span className="text-xs font-bold text-white">
                  {result.distanceAheadMeters >= 0 ? `${result.minutesAhead} min` : formatMiles(Math.abs(result.distanceAheadMeters))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- Trip bar (dark, expandable) ---- */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex justify-center">
        <div className="w-full max-w-xl rounded-t-3xl bg-[#171a1e] pb-[max(0.9rem,env(safe-area-inset-bottom))] shadow-sheet">
          <button
            type="button"
            aria-label={menuOpen ? 'Close trip menu' : 'Open trip menu'}
            onClick={() => {
              setMenuOpen(!menuOpen)
              setDirectionsOpen(false)
            }}
            className="mx-auto mt-2 block h-6 w-24"
          >
            <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/30" />
          </button>
          <div className="flex items-center justify-between px-5 pt-1">
            <div>
              <p className="text-3xl font-black leading-none text-[#fbbc04]">
                {Math.max(1, Math.round(current.remainingSeconds / 60))} min
              </p>
              <p className="mt-1 text-base text-white/70">
                {formatMiles(current.remaining)} ·{' '}
                {current.eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Turn-by-turn directions"
                onClick={() => {
                  setDirectionsOpen(!directionsOpen)
                  setMenuOpen(false)
                }}
                className="press flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white/10 text-xl text-white"
              >
                ☰
              </button>
              <button
                type="button"
                onClick={onEnd}
                className="press flex h-16 w-16 items-center justify-center rounded-full bg-[#ea4335] text-base font-black text-white shadow-float"
              >
                Exit
              </button>
            </div>
          </div>

          {/* Expanded menu */}
          {menuOpen && (
            <div className="mt-3 border-t border-white/10 px-2">
              <MenuRow icon="🧭" label="Directions list" onClick={() => { setDirectionsOpen(true); setMenuOpen(false) }} />
              <MenuRow icon="📤" label="Share trip progress" onClick={shareTrip} />
              <MenuRow
                icon="🗺"
                label="View whole route"
                onClick={() => { setDriveView('overview'); setMenuOpen(false) }}
              />
              <MenuRow
                icon={voiceOn ? '🔊' : '🔇'}
                label={voiceOn ? 'Voice guidance: on' : 'Voice guidance: off'}
                onClick={() => setVoiceOn(!voiceOn)}
              />
            </div>
          )}

          {/* Turn-by-turn directions list */}
          {directionsOpen && (
            <div className="mt-3 max-h-[45dvh] overflow-y-auto border-t border-white/10 px-4">
              {route.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-white/5 py-3.5">
                  <span className="shrink-0 text-white/90">
                    <ManeuverArrow maneuver={step.maneuver} size={30} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-snug text-white">{step.instruction}</p>
                    {step.distanceMeters > 0 && (
                      <p className="text-sm text-white/50">{formatMiles(step.distanceMeters)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function MenuRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left hover:bg-white/5"
    >
      <span aria-hidden className="text-2xl">{icon}</span>
      <span className="text-lg font-semibold text-white">{label}</span>
    </button>
  )
}
