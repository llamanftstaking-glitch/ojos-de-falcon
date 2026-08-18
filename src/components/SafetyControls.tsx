'use client'

import clsx from 'clsx'
import { FILTER_GROUPS } from '@/lib/categories'
import { useAppStore } from '@/store/app-store'

/** Safety Mode toggle + category quick filters. */
export default function SafetyControls() {
  const safetyMode = useAppStore((s) => s.safetyMode)
  const setSafetyMode = useAppStore((s) => s.setSafetyMode)
  const filterGroup = useAppStore((s) => s.filterGroup)
  const setFilterGroup = useAppStore((s) => s.setFilterGroup)

  return (
    <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-2">
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => setSafetyMode(!safetyMode)}
          aria-pressed={safetyMode}
          className={clsx(
            'press shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-float transition-colors',
            safetyMode
              ? 'border-safety bg-safety text-white'
              : 'border-line bg-surface-raised text-ink-muted'
          )}
        >
          {safetyMode ? '● SAFETY MODE ON' : '○ SAFETY MODE OFF'}
        </button>
        {safetyMode &&
          FILTER_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setFilterGroup(g.id)}
              aria-pressed={filterGroup === g.id}
              className={clsx(
                'press shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium shadow-float transition-colors',
                filterGroup === g.id
                  ? 'border-safety-strong bg-safety-strong text-white'
                  : 'border-line bg-surface-raised text-ink-muted hover:text-ink'
              )}
            >
              {g.label}
            </button>
          ))}
      </div>
    </div>
  )
}
