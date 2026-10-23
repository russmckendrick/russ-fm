import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/format'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; busy?: boolean }
>(function Button({ variant = 'secondary', size = 'md', busy, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-accent text-accent-fg hover:opacity-90',
        variant === 'secondary' && 'border border-line bg-panel text-fg shadow-[0_1px_0_rgb(0_0_0/0.03)] hover:bg-hover',
        variant === 'ghost' && 'text-muted hover:bg-hover hover:text-fg',
        variant === 'danger' && 'border border-line bg-panel text-bad hover:bg-bad/10',
        className,
      )}
      {...rest}
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  )
})

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(
  function Input({ className, icon, ...rest }, ref) {
    return (
      <div className={cn('relative flex items-center', className)}>
        {icon && <span className="pointer-events-none absolute left-2.5 text-faint">{icon}</span>}
        <input
          ref={ref}
          className={cn(
            'h-8 w-full rounded-md border border-line bg-panel px-2.5 text-[13px] text-fg placeholder:text-faint',
            'focus:border-accent focus:outline-none focus-visible:outline-none',
            icon ? 'pl-8' : undefined,
          )}
          {...rest}
        />
      </div>
    )
  },
)

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-8 max-w-48 rounded-md border border-line bg-panel pr-7 pl-2.5 text-[13px] text-fg',
        'appearance-none bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus:border-accent focus:outline-none',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Toggle({
  pressed,
  onChange,
  children,
  className,
  title,
}: {
  pressed: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={() => onChange(!pressed)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors',
        pressed ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel text-muted hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
}) {
  return (
    <div className="inline-flex h-8 rounded-md border border-line bg-panel p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center rounded px-2 text-[13px] transition-colors',
            value === o.value ? 'bg-panel-2 text-fg shadow-sm' : 'text-faint hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'bad'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-panel-2 text-muted',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'ok' && 'bg-ok/12 text-ok',
        tone === 'warn' && 'bg-warn/12 text-warn',
        tone === 'bad' && 'bg-bad/12 text-bad',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg border border-line bg-panel shadow-panel', className)}>{children}</div>
}

export function CardHeader({ title, actions, sub }: { title: ReactNode; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {sub && <p className="text-xs text-faint">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-panel-2 px-1 font-sans text-[11px] text-faint">
      {children}
    </kbd>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-faint', className)} />
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-6 pt-6 pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-sm text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <EmptyState
      title="Something went wrong"
      body={<span className="font-mono text-xs">{error instanceof Error ? error.message : String(error)}</span>}
    />
  )
}

export function Progress({ value, total, className }: { value: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-panel-2', className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** A small external link chip (Discogs, Spotify, …). */
export function LinkChip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      {children}
    </a>
  )
}
