import { Check, ChevronRight, Copy } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/format'
import { Button } from './ui'

/** A collapsible JSON tree (objects/arrays fold; top levels start open) with copy-all. */
export function JsonView({ value, title }: { value: unknown; title: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-muted">{title}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(JSON.stringify(value, null, 2))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="overflow-x-auto p-3 font-mono text-xs leading-5">
        <Node value={value} depth={0} />
      </div>
    </div>
  )
}

function Node({ value, depth, name }: { value: unknown; depth: number; name?: string }) {
  const [open, setOpen] = useState(depth < 1)
  const label = name !== undefined && <span className="text-accent">{JSON.stringify(name)}: </span>

  if (value === null || typeof value !== 'object') {
    const cls =
      typeof value === 'string' ? 'text-ok' : typeof value === 'number' ? 'text-warn' : 'text-faint'
    const text = typeof value === 'string' && value.length > 400 ? `${JSON.stringify(value.slice(0, 400))}…` : JSON.stringify(value)
    return (
      <div className="break-all whitespace-pre-wrap">
        {label}
        <span className={cls}>{text}</span>
      </div>
    )
  }

  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value)
  const [lb, rb] = Array.isArray(value) ? ['[', ']'] : ['{', '}']
  if (entries.length === 0)
    return (
      <div>
        {label}
        <span className="text-faint">
          {lb}
          {rb}
        </span>
      </div>
    )

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center text-left hover:text-fg">
        <ChevronRight className={cn('-ml-4 size-3.5 text-faint transition-transform', open && 'rotate-90')} />
        {label}
        <span className="text-faint">
          {lb}
          {!open && ` ${entries.length} ${Array.isArray(value) ? 'items' : 'keys'} ${rb}`}
        </span>
      </button>
      {open && (
        <>
          <div className="border-l border-line pl-4">
            {entries.map(([k, v]) => (
              <Node key={k} name={Array.isArray(value) ? undefined : k} value={v} depth={depth + 1} />
            ))}
          </div>
          <span className="text-faint">{rb}</span>
        </>
      )}
    </div>
  )
}
