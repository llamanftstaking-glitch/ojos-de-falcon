'use client'

import { useRef, useState } from 'react'
import { useAppStore } from '@/store/app-store'

const HOLD_MS = 2000

/**
 * SOS control — deliberately hard to trigger by accident: requires a
 * ~2-second press-and-hold with a visible progress ring before the SOS
 * options sheet opens. Releasing early cancels.
 */
export default function SOSButton() {
  const [progress, setProgress] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAt = useRef(0)
  const setSheet = useAppStore((s) => s.setSheet)

  function startHold() {
    startedAt.current = Date.now()
    timer.current = setInterval(() => {
      const pct = Math.min(1, (Date.now() - startedAt.current) / HOLD_MS)
      setProgress(pct)
      if (pct >= 1) {
        cancelHold()
        if (navigator.vibrate) navigator.vibrate(80)
        setSheet({ kind: 'sos' })
      }
    }, 40)
  }

  function cancelHold() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setProgress(0)
  }

  const ringStyle =
    progress > 0
      ? { background: `conic-gradient(rgb(var(--emergency)) ${progress * 360}deg, transparent 0deg)` }
      : undefined

  return (
    <button
      type="button"
      aria-label="SOS — press and hold for two seconds to open emergency options"
      className="pointer-events-auto relative flex h-20 w-20 select-none flex-col items-center justify-center rounded-full bg-emergency font-black tracking-wider text-white shadow-float active:scale-95"
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={(e) => e.preventDefault()}
    >
      {progress > 0 && (
        <span aria-hidden className="absolute -inset-1.5 rounded-full opacity-80" style={ringStyle} />
      )}
      <span className="relative text-lg leading-none">SOS</span>
      <span className="relative mt-0.5 text-[10px] font-bold leading-none opacity-90">HOLD</span>
      {progress > 0 && (
        <span className="absolute -bottom-8 whitespace-nowrap rounded-lg bg-surface-raised px-2.5 py-1 text-xs font-semibold text-ink shadow-float">
          Keep holding…
        </span>
      )}
    </button>
  )
}
