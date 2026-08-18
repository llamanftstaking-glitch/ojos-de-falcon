'use client'

import { useEffect, useState } from 'react'
import { BRAND } from '@/brand'

const STORAGE_KEY = 'odf-welcomed'

/**
 * One-time first-run explainer. Three plain-language lines, one big button.
 * Written for someone who has never used a map app — no jargon, no icons
 * without words.
 */
export default function WelcomeCard() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true)
    } catch {
      // Storage unavailable — skip the card rather than nag every visit.
    }
  }, [])

  if (!show) return null

  function dismiss() {
    setShow(false)
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Fine.
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface-raised p-6 shadow-sheet">
        <h2 className="text-2xl font-black text-ink">Welcome to {BRAND.shortName}</h2>
        <p className="mt-1 text-base text-ink-muted">The map that keeps you safe. Three things to know:</p>
        <ul className="mt-4 flex flex-col gap-4">
          <li className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 text-2xl">🔍</span>
            <p className="text-lg leading-snug text-ink">
              <strong>Type where you want to go</strong> in the search box at the top.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 text-2xl">🦅</span>
            <p className="text-lg leading-snug text-ink">
              <strong>Tap the gold falcon button</strong> when you drive. It speaks and shows police,
              fire, and hospitals near you.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 text-2xl">🆘</span>
            <p className="text-lg leading-snug text-ink">
              <strong>In an emergency, press and hold the red SOS button</strong> for two seconds.
            </p>
          </li>
        </ul>
        <button
          type="button"
          onClick={dismiss}
          className="press mt-6 w-full rounded-2xl bg-safety px-6 py-5 text-xl font-black text-white shadow-float"
        >
          GOT IT — SHOW ME THE MAP
        </button>
      </div>
    </div>
  )
}
