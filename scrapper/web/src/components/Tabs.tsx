import type { ReactNode } from 'react'
import { cn } from '@/lib/format'

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T
  onChange: (v: T) => void
  tabs: { value: T; label: ReactNode; count?: number }[]
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            '-mb-px flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[13px] transition-colors',
            value === t.value ? 'border-fg font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="text-xs text-faint tabular-nums">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
