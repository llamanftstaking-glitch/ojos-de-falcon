'use client'

import { useEffect, useRef, useState } from 'react'
import {
  searchSafety,
  geocode,
  fetchAutocomplete,
  fetchPlace,
  type GeocodeResult,
  type PlaceSuggestion,
} from '@/lib/client-api'
import { useAppStore } from '@/store/app-store'
import { CATEGORIES } from '@/lib/categories'
import { flyTo } from './map-controller'
import type { SafetyLocation } from '@/lib/types'
import { BRAND } from '@/brand'

interface Suggestions {
  safety: SafetyLocation[]
  /** Google Places type-ahead hits (preferred when the key is configured). */
  predictions: PlaceSuggestion[]
  /** Plain geocode fallback when autocomplete is unavailable. */
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
      const [safety, predictions] = await Promise.all([
        searchSafety(q, center).catch(() => [] as SafetyLocation[]),
        fetchAutocomplete(q, center).catch(() => [] as PlaceSuggestion[]),
      ])
      // No Places key (or no hits): fall back to plain geocoding so search
      // never goes dark.
      const places =
        predictions.length === 0 ? await geocode(q, center).catch(() => [] as GeocodeResult[]) : []
      setSuggestions({
        safety: safety.slice(0, 4),
        predictions: predictions.slice(0, 5),
        places: places.slice(0, 4),
      })
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

  async function pickPrediction(p: PlaceSuggestion) {
    setQuery('')
    setSuggestions(null)
    const place = await fetchPlace(p.placeId)
    if (place) onPickDestination({ name: place.name, lngLat: place.lngLat })
  }

  return (
    <div className="pointer-events-auto relative w-full max-w-xl">
      <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-raised px-4 py-4 shadow-float">
        <span aria-hidden className="text-xl text-ink-faint">⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Where do you want to go?"
          aria-label={`Search destinations and safety locations in ${BRAND.name}`}
          className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
          enterKeyHint="search"
        />
        {searching && <span className="animate-pulse text-sm text-ink-faint">…</span>}
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            className="press -m-2 p-2 text-lg text-ink-faint hover:text-ink"
            onClick={() => { setQuery(''); setSuggestions(null) }}
          >
            ✕
          </button>
        )}
      </div>

      {suggestions && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-float">
          {suggestions.safety.length === 0 &&
            suggestions.predictions.length === 0 &&
            suggestions.places.length === 0 &&
            !searching && (
              <p className="px-4 py-4 text-base text-ink-muted">No results. Try a different name, address, or ZIP.</p>
            )}
          {suggestions.predictions.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Destinations</p>
              {suggestions.predictions.map((p) => (
                <button
                  key={p.placeId}
                  type="button"
                  onClick={() => pickPrediction(p)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-overlay"
                >
                  <span aria-hidden className="text-ink-faint">📍</span>
                  <span className="min-w-0">
                    <span className="block truncate text-base text-ink">{p.main}</span>
                    {p.secondary && (
                      <span className="block truncate text-sm text-ink-muted">{p.secondary}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
          {suggestions.safety.length > 0 && (
            <div className={suggestions.predictions.length > 0 ? 'border-t border-line' : undefined}>
              <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Safety locations</p>
              {suggestions.safety.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => pickSafety(loc)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-overlay"
                >
                  <span aria-hidden className="text-xl">{CATEGORIES[loc.category]?.glyph ?? '•'}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-base text-ink">{loc.name}</span>
                    <span className="block truncate text-sm text-ink-muted">
                      {CATEGORIES[loc.category]?.label}{loc.city ? ` · ${loc.city}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {suggestions.places.length > 0 && (
            <div className="border-t border-line">
              <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Places</p>
              {suggestions.places.map((place, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickPlace(place)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-overlay"
                >
                  <span aria-hidden className="text-ink-faint">➤</span>
                  <span className="truncate text-base text-ink">{place.name}</span>
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
