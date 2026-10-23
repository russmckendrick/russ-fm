import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/format'
import { useJobs } from '@/lib/jobs'

export function Toasts() {
  const { toasts, store } = useJobs()
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.tone === 'ok' ? CheckCircle2 : t.tone === 'bad' ? XCircle : Info
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-rise-in gap-2.5 rounded-lg border border-line bg-panel p-3 shadow-panel"
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', t.tone === 'ok' ? 'text-ok' : t.tone === 'bad' ? 'text-bad' : 'text-faint')} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{t.title}</p>
              {t.body && <p className="mt-0.5 line-clamp-3 text-xs text-muted">{t.body}</p>}
              {t.jobId !== undefined && (
                <Link to={`/jobs/${t.jobId}`} className="mt-1 inline-block text-xs text-accent hover:underline">
                  View log
                </Link>
              )}
            </div>
            <button onClick={() => store.dismiss(t.id)} className="self-start text-faint hover:text-fg" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
