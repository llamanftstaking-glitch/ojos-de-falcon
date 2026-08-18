'use client'

import { useAppStore } from '@/store/app-store'
import { CATEGORIES } from '@/lib/categories'
import { formatMiles, haversineMeters, estimateDriveMinutes } from '@/lib/geo'
import type { SafetyLocation } from '@/lib/types'
import VerificationBadge from './VerificationBadge'

const SUBCATEGORY_LABELS: Record<string, string> = {
  local: 'Local Police',
  transit: 'Transit Police',
  campus: 'Campus Police',
  federal: 'Federal Court',
  state: 'State Court',
  county: 'County Court',
  city: 'City Court',
  family: 'Family Court',
  criminal: 'Criminal Court',
  civil: 'Civil Court',
  traffic: 'Traffic Court',
}

/**
 * Location detail card. Unknown fields show "Not available" — the platform
 * never fabricates hours, phones, or capabilities.
 */
export default function LocationDetailSheet({
  location,
  onNavigate,
}: {
  location: SafetyLocation
  onNavigate: (loc: SafetyLocation) => void
}) {
  const userLocation = useAppStore((s) => s.userLocation)
  const def = CATEGORIES[location.category]
  const distance = userLocation
    ? haversineMeters(userLocation, [location.longitude, location.latitude])
    : null

  const addressLine = [location.address, location.city, location.state, location.zip]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-3xl">{def?.glyph}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight text-ink">{location.name}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {(location.subcategory && SUBCATEGORY_LABELS[location.subcategory]) || def?.label}
            {location.jurisdiction ? ` · ${location.jurisdiction}` : ''}
          </p>
        </div>
        <VerificationBadge status={location.verification} />
      </div>

      {(distance !== null || location.is24Hours !== null) && (
        <div className="flex gap-2 text-sm">
          {distance !== null && (
            <span className="rounded-lg bg-surface-overlay px-2.5 py-1.5 font-medium text-ink">
              {formatMiles(distance)} · ~{estimateDriveMinutes(distance)} min drive
            </span>
          )}
          {location.is24Hours === true && (
            <span className="rounded-lg bg-verified/15 px-2.5 py-1.5 font-medium text-verified">Open 24 hours</span>
          )}
        </div>
      )}

      <dl className="flex flex-col gap-2.5 rounded-xl bg-surface-overlay p-4 text-base">
        <DetailRow label="Address" value={addressLine || null} />
        <DetailRow label="Phone" value={location.phone} href={location.phone ? `tel:${location.phone}` : undefined} />
        <DetailRow
          label="Non-emergency"
          value={location.nonEmergencyPhone}
          href={location.nonEmergencyPhone ? `tel:${location.nonEmergencyPhone}` : undefined}
        />
        <DetailRow label="Hours" value={location.is24Hours ? 'Open 24 hours' : location.hours} />
        <DetailRow
          label="Website"
          value={location.website ? location.website.replace(/^https?:\/\//, '') : null}
          href={location.website ?? undefined}
        />
        {location.services.length > 0 && (
          <DetailRow label="Services" value={location.services.map(humanizeService).join(', ')} />
        )}
        <DetailRow label="Accessibility" value={location.accessibility} />
        <DetailRow label="Parking" value={location.parking} />
      </dl>

      <p className="text-[11px] leading-snug text-ink-faint">
        {location.sourceAttribution ?? `Source: ${location.source}`}
        {location.lastVerified ? ` · Last verified ${location.lastVerified}` : ' · Not yet verified — details may be out of date.'}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onNavigate(location)}
          className="press flex-1 rounded-2xl bg-safety px-4 py-4 text-base font-black text-white shadow-float"
        >
          🧭 Take me there
        </button>
        {location.phone && (
          <a
            href={`tel:${location.phone}`}
            className="press flex-1 rounded-2xl bg-verified px-4 py-4 text-center text-base font-black text-white shadow-float"
          >
            📞 Call
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            if (navigator.share) {
              navigator
                .share({ title: location.name, text: `${location.name}${addressLine ? ` — ${addressLine}` : ''}` })
                .catch(() => {})
            } else {
              navigator.clipboard?.writeText(`${location.name}${addressLine ? ` — ${addressLine}` : ''}`).catch(() => {})
            }
          }}
          className="press rounded-2xl border border-line bg-surface-raised px-4 py-4 text-base font-bold text-ink"
        >
          Share
        </button>
      </div>
    </div>
  )
}

function DetailRow({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-28 shrink-0 text-sm font-medium uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">
        {value ? (
          href ? (
            <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="break-words text-safety underline-offset-2 hover:underline">
              {value}
            </a>
          ) : (
            <span className="break-words">{value}</span>
          )
        ) : (
          <span className="text-ink-faint">Not available</span>
        )}
      </dd>
    </div>
  )
}

function humanizeService(service: string): string {
  return service.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
