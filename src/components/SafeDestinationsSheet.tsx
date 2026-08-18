'use client'

import { CATEGORIES } from '@/lib/categories'
import { formatMiles } from '@/lib/geo'
import type { SafeDestinationCandidate, SafetyLocation } from '@/lib/types'

/**
 * "Take me somewhere safe" results: ranked safe destinations with the
 * reasons behind each ranking, so the choice is explainable.
 */
export default function SafeDestinationsSheet({
  candidates,
  onNavigate,
}: {
  candidates: SafeDestinationCandidate[]
  onNavigate: (loc: SafetyLocation) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink">Safe destinations</h2>
      {candidates.length === 0 && (
        <p className="rounded-xl bg-surface-overlay p-3 text-base text-ink-muted">
          No safe destinations could be found right now. If this is an emergency, call your local
          emergency number (911 in the US).
        </p>
      )}
      {candidates.map((c, i) => (
        <button
          key={c.location.id}
          type="button"
          onClick={() => onNavigate(c.location)}
          className={`press flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-surface-overlay ${
            i === 0 ? 'border-safety bg-safety/5' : 'border-line'
          }`}
        >
          <span aria-hidden className="text-2xl">{CATEGORIES[c.location.category]?.glyph}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-ink">
              {i === 0 && <span className="mr-1.5 rounded bg-safety px-1.5 py-0.5 text-xs font-bold text-white">BEST</span>}
              {c.location.name}
            </span>
            <span className="block text-sm text-ink-muted">
              {formatMiles(c.distanceMeters)} · ~{c.etaMinutes} min
              {c.reasons.length > 0 ? ` · ${c.reasons.slice(0, 2).join(' · ')}` : ''}
            </span>
          </span>
          <span aria-hidden className="text-ink-faint">➤</span>
        </button>
      ))}
    </div>
  )
}
