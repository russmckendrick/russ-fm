import { useEffect, useRef } from 'react'
import { cn } from '@/lib/format'
import { Card } from './ui'

/** A job's log: monospace, tail-following unless you've scrolled up to read. */
export function LogView({ lines, running, compact }: { lines: string[]; running: boolean; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [lines.length])

  return (
    <Card className={cn('flex flex-col overflow-hidden', compact ? 'max-h-80' : 'min-h-64 flex-1')}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs text-muted">
        <span>Log</span>
        <span className="tabular-nums">{lines.length} lines</span>
      </div>
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
        className={cn('min-h-0 flex-1 overflow-y-auto bg-panel-2/50 p-3 font-mono text-xs leading-5', !compact && 'max-h-[60vh]')}
      >
        {lines.length === 0 ? (
          <span className="text-faint">{running ? 'Waiting for output…' : 'No output.'}</span>
        ) : (
          lines.map((l, i) => (
            <div
              key={i}
              className={cn(
                'break-words whitespace-pre-wrap',
                /^\s*(✗|⚠)|\berror\b|failed/i.test(l) && 'text-bad',
                /^\s*⚠/.test(l) && 'text-warn',
                /^\s*✓/.test(l) && 'text-ok',
                /^\s*▶/.test(l) && 'font-semibold text-fg',
              )}
            >
              {l}
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
