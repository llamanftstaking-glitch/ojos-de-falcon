'use client'

import { type ReactNode } from 'react'
import clsx from 'clsx'

/**
 * Bottom information sheet — the shared container for nearby safety,
 * location details, route previews, and SOS options.
 */
export default function BottomSheet({
  open,
  onClose,
  children,
  ariaLabel,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabel: string
}) {
  return (
    <div
      className={clsx(
        'pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center transition-transform duration-300 ease-out',
        open ? 'translate-y-0' : 'translate-y-full'
      )}
      aria-hidden={!open}
    >
      <section
        role="dialog"
        aria-label={ariaLabel}
        className="pointer-events-auto w-full max-w-xl rounded-t-sheet border border-b-0 border-line bg-surface-raised shadow-sheet"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="mx-auto mt-2 block h-6 w-16 cursor-pointer"
        >
          <span className="mx-auto block h-1.5 w-12 rounded-full bg-ink-faint/60" />
        </button>
        <div className="max-h-[55dvh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          {children}
        </div>
      </section>
    </div>
  )
}
