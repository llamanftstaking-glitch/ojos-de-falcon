'use client'

import { useEffect, useRef, useState } from 'react'
import { searchSafety, geocode, type GeocodeResult } from '@/lib/client-api'
import { useAppStore } from '@/store/app-store'
import { CATEGORIES } from '@/lib/categories'
import { flyTo } from './map-controller'
import type { SafetyLocation } from '@/lib/types'
import { BRAND } from '@/brand'

interface Suggestions {
  safety: SafetyLocation[]
  places: GeocodeResult[]
}

/**
 * Destination + safety search. Safety POIs come from our corpus; free-text
 * places resolve through the geocoding adapter. Debounced, keyboard and
 * screen-reader friendly.
 */
export default function SearchBar({ onPickDestination }: {
  onPickDestination: (dest: { name: string; lngLat: [number, number] }) => void
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)
  const [searching, setSearching] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userLocation = useAppStore((s) => s.userLocation)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions(null)
      return
    }
    debounce.current = setTimeout(async () => {
      setSearching(true)
      const center = userLocation ?? undefined
      const [safety, places] = await Promise.all([
        searchSafety(q, center).catch(() => [] as SafetyLocation[]),
        geocode(q, center).catch(() => [] as GeocodeResult[]),
      ])
      setSuggestions({ safety: safety.slice(0, 5), places: places.slice(0, 4) })
      setSearching(false)
    }, 300)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [query, userLocation])

  function pickSafety(loc: SafetyLocation) {
    setQuery('')
    setSuggestions(null)
    flyTo([loc.longitude, loc.latitude], 15)
    useAppStore.getState().setSheet({ kind: 'detail', location: loc })
  }

  function pickPlace(place: GeocodeResult) {
    setQuery('')
    setSuggestions(null)
    onPickDestination({ name: shortName(place.name), lngLat: place.lngLat })
  }

  return (
    <div className="pointer-events-auto relative w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-raised px-4 py-3 shadow-float">
        <span aria-hidden className="text-ink-faint">⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Where are you going?"
          aria-label={`Search destinations and safety locations in ${BRAND.name}`}
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          enterKeyHint="search"
        />
        {searching && <span className="animate-pulse text-xs text-ink-faint">…</span>}
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            className="text-ink-faint hover:text-ink"
            onClick={() => { setQuery(''); setSuggestions(null) }}
          >
            ✕
          </button>
        )}
      </div>

      {suggestions && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-float">
          {suggestions.safety.length === 0 && suggestions.places.length === 0 && !searching && (
            <p className="px-4 py-3 text-sm text-ink-muted">No results. Try a different name, address, or ZIP.</p>
          )}
          {suggestions.safety.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Safety locations</p>
              {suggestions.safety.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => pickSafety(loc)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-overlay"
                >
                  <span aria-hidden>{CATEGORIES[loc.category]?.glyph ?? '•'}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{loc.name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {CATEGORIES[loc.category]?.label}{loc.city ? ` · ${loc.city}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {suggestions.places.length > 0 && (
            <div className="border-t border-line">
              <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Places</p>
              {suggestions.places.map((place, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickPlace(place)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-overlay"
                >
                  <span aria-hidden className="text-ink-faint">➤</span>
                  <span className="truncate text-sm text-ink">{place.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function shortName(displayName: string): string {
  return displayName.split(',').slice(0, 2).join(',')
}
