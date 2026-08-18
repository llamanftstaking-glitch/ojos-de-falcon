'use client'

import type { Maneuver } from '@/lib/routing/types'

/**
 * Big Waze-style turn arrow for the navigation banner. One arrow glyph
 * rotated per maneuver, plus dedicated shapes for U-turn and roundabout.
 */

const ROTATION: Partial<Record<Maneuver, number>> = {
  depart: 0,
  straight: 0,
  merge: 0,
  'slight-left': -45,
  'slight-right': 45,
  'fork-left': -45,
  'fork-right': 45,
  'ramp-left': -45,
  'ramp-right': 45,
  'turn-left': -90,
  'turn-right': 90,
  'sharp-left': -135,
  'sharp-right': 135,
}

export default function ManeuverArrow({ maneuver, size = 52 }: { maneuver?: Maneuver; size?: number }) {
  if (maneuver === 'arrive') {
    return (
      <span aria-hidden style={{ fontSize: size * 0.8, lineHeight: 1 }}>
        🏁
      </span>
    )
  }
  if (maneuver === 'uturn') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
        <path
          d="M18 42 L18 20 C18 13 22 9 28 9 C34 9 38 13 38 20 L38 26"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M30 24 L38 34 L46 24" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" transform="rotate(180 38 29)" />
      </svg>
    )
  }
  if (maneuver === 'roundabout') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
        <circle cx="24" cy="26" r="12" stroke="currentColor" strokeWidth="6" fill="none" />
        <path d="M24 4 L24 14" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M17 10 L24 3 L31 10" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }
  const deg = ROTATION[maneuver ?? 'straight'] ?? 0
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      style={{ transform: `rotate(${deg}deg)` }}
    >
      <path d="M24 44 L24 12" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <path
        d="M12 20 L24 6 L36 20"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
