'use client'

import type { VerificationStatus } from '@/lib/types'

const LABELS: Record<VerificationStatus, { label: string; tone: 'verified' | 'muted' | 'hazard' }> = {
  verified_official: { label: 'Verified', tone: 'verified' },
  verified_community: { label: 'Community verified', tone: 'verified' },
  unverified: { label: 'Unverified', tone: 'muted' },
  needs_review: { label: 'Needs review', tone: 'hazard' },
  temporarily_closed: { label: 'Temporarily closed', tone: 'hazard' },
  permanently_closed: { label: 'Permanently closed', tone: 'hazard' },
}

/**
 * Data-honesty badge: every location surface shows whether its record is
 * verified. Unverified data is never dressed up as authoritative.
 */
export default function VerificationBadge({
  status,
  compact = false,
}: {
  status: VerificationStatus
  compact?: boolean
}) {
  const { label, tone } = LABELS[status] ?? LABELS.unverified
  const toneClass =
    tone === 'verified'
      ? 'bg-verified/15 text-verified'
      : tone === 'hazard'
        ? 'bg-hazard/15 text-hazard'
        : 'bg-surface-overlay text-ink-faint'
  if (compact && status === 'unverified') return null
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${toneClass}`}>
      {tone === 'verified' ? '✓ ' : ''}{label}
    </span>
  )
}
