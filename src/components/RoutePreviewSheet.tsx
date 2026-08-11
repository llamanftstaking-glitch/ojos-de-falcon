'use client'

import { useAppStore } from '@/store/app-store'
import { CATEGORIES } from '@/lib/categories'
import { formatMiles } from '@/lib/geo'

/**
 * Route preview: ETA, distance, route safety summary, and safety
 * facilities ahead — shown before the user starts navigation.
 */
export default function RoutePreviewSheet({ onStart, onCancel }: {
  onStart: () => void
  onCancel: () => void
}) {
  const destination = useAppStore((s) => s.destination)
  const route = useAppStore((s) => s.route)
  const routeSafety = useAppStore((s) => s.routeSafety)
  const routeSummary = useAppStore((s) => s.routeSummary)

  if (!route || !destination) return null

  const minutes = Math.round(route.durationSeconds / 60)
  const eta = new Date(Date.now() + route.durationSeconds * 1000)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="truncate text-base font-bold text-ink">{destination.name}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          {minutes} min · {formatMiles(route.distanceMeters)} · ETA{' '}
          {eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </p>
        {route.approximate && (
          <p className="mt-1.5 rounded-lg bg-hazard/15 px-2.5 py-1.5 text-xs font-medium text-hazard">
            Direct-path estimate — road routing is unavailable right now. Times and distances are
            approximate and turn-by-turn directions are not shown.
          </p>
        )}
      </div>

      {routeSummary && (
        <div className="rounded-xl bg-surface-overlay p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Route safety</p>
          <p className="mt-1 text-sm text-ink">
            {routeSummary.policeCount} police · {routeSummary.fireCount} fire ·{' '}
            {routeSummary.medicalCount} medical{routeSummary.courtCount > 0 ? ` · ${routeSummary.courtCount} courts` : ''} near this route
          </p>
        </div>
      )}

      {routeSafety.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {routeSafety.slice(0, 4).map((r) => (
            <li key={r.location.id} className="flex items-center gap-3 py-2">
              <span aria-hidden className="w-6 text-center">{CATEGORIES[r.location.category]?.glyph}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{r.location.name}</span>
                <span className="block text-xs text-ink-muted">
                  {r.distanceAheadMeters >= 0 ? `${r.minutesAhead} min ahead` : 'Behind you'} ·{' '}
                  {formatMiles(r.distanceFromRouteMeters)} off route
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onStart}
          className="flex-1 rounded-xl bg-safety px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-float"
        >
          Start route
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-line bg-surface-raised px-5 py-3.5 text-sm font-bold text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
