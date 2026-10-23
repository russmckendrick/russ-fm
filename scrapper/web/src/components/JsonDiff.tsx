import { FileJson } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/format'

export interface Change {
  path: string
  kind: 'added' | 'removed' | 'changed'
  before?: unknown
  after?: unknown
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Leaf-level differences between two JSON values: `tracklist[3].title`, `country`, … */
export function diffJson(before: unknown, after: unknown, path = ''): Change[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  if (before === undefined) return [{ path, kind: 'added', after }]
  if (after === undefined) return [{ path, kind: 'removed', before }]
  if (isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    return keys.flatMap((k) => diffJson(before[k], after[k], path ? `${path}.${k}` : k))
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    // Lists of plain values read better as one change than item by item.
    if ([...before, ...after].every((v) => !isObj(v) && !Array.isArray(v))) return [{ path, kind: 'changed', before, after }]
    const n = Math.max(before.length, after.length)
    return Array.from({ length: n }, (_, i) => diffJson(before[i], after[i], `${path}[${i}]`)).flat()
  }
  return [{ path, kind: 'changed', before, after }]
}

/** Timestamps that every save bumps, so a diff doesn't lead with them. */
const NOISE = /(^|\.)(updated_at|processed_at)$/

/** One file's changes, before → after. */
export function FileDiff({ path, before, after }: { path: string; before: unknown; after: unknown }) {
  const all = diffJson(before, after)
  const changes = all.filter((c) => !NOISE.test(c.path))
  const noise = all.length - changes.length
  return (
    <section className="overflow-hidden rounded-lg border border-line">
      <header className="flex items-center gap-2 border-b border-line bg-panel-2/60 px-3 py-2 text-xs">
        <FileJson className="size-3.5 text-faint" />
        <code className="min-w-0 flex-1 truncate font-mono">{path}</code>
        <span className="text-faint">
          {before === null || before === undefined ? 'new' : `${changes.length} change${changes.length === 1 ? '' : 's'}`}
          {noise > 0 && ` · +${noise} timestamp`}
        </span>
      </header>
      {changes.length === 0 ? (
        <p className="px-3 py-3 text-xs text-faint">No visible change{noise ? ' (timestamps only)' : ''}.</p>
      ) : (
        <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto">
          {changes.map((c) => (
            <ChangeRow key={c.path} c={c} />
          ))}
        </ul>
      )}
    </section>
  )
}

function show(v: unknown): string {
  if (v === undefined) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, Array.isArray(v) || isObj(v) ? 1 : 0)
}

function ChangeRow({ c }: { c: Change }) {
  const [open, setOpen] = useState(false)
  const b = show(c.before)
  const a = show(c.after)
  const long = b.length > 160 || a.length > 160
  return (
    <li className="grid gap-1.5 px-3 py-2 text-xs sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
      <code className="truncate pt-0.5 font-mono text-muted" title={c.path}>
        {c.path || '(value)'}
      </code>
      <div className={cn('min-w-0 space-y-1', !open && long && 'max-h-28 overflow-hidden')}>
        {c.kind !== 'added' && (
          <p className="rounded bg-bad/10 px-1.5 py-0.5 font-mono break-words whitespace-pre-wrap text-bad line-through decoration-bad/40">{b || '∅'}</p>
        )}
        {c.kind !== 'removed' && <p className="rounded bg-ok/10 px-1.5 py-0.5 font-mono break-words whitespace-pre-wrap text-ok">{a || '∅'}</p>}
      </div>
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="text-left text-accent hover:underline sm:col-start-2">
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </li>
  )
}
