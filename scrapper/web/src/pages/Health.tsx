import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CheckCircle2, ChevronRight, HeartPulse, RefreshCw, Wrench } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { commandLine } from '@/components/CommandForm'
import { Cover } from '@/components/Cover'
import { JobInline, useRunner } from '@/components/JobInline'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui'
import { api, keys } from '@/lib/api'
import { cn, num } from '@/lib/format'
import { albumImageUrl, artistImageUrl } from '@/lib/media'
import type { HealthCheck, HealthItem } from '@/lib/types'

export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: api.health, staleTime: 60_000, select: (d) => d.checks })

/** What's missing or mismatched, and the fix for each — one record, or all of them. */
export function HealthPage() {
  const { data, error, isLoading, isFetching, refetch } = useHealth()
  const [params, setParams] = useSearchParams()
  const open = params.get('check')

  if (error) return <ErrorState error={error} />
  const groups = [...new Set((data ?? []).map((c) => c.group))]

  return (
    <div className="mx-auto max-w-5xl pb-12">
      <PageHeader
        title="Data health"
        sub="Gaps across the database and public/, with the command that fixes each. Fixes that need a choice ask you as they go."
        actions={
          <Button onClick={() => void refetch()} busy={isFetching}>
            {!isFetching && <RefreshCw className="size-3.5" />} Re-check
          </Button>
        }
      />
      {isLoading ? (
        <div className="flex h-48 items-center justify-center gap-2 text-[13px] text-muted">
          <Spinner /> Checking every release and artist…
        </div>
      ) : (
        <div className="space-y-8 px-6">
          {groups.map((g) => (
            <section key={g}>
              <h2 className="mb-2 text-xs font-medium tracking-wide text-faint uppercase">{g}</h2>
              <div className="space-y-2">
                {data!
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <CheckCard
                      key={c.id}
                      check={c}
                      open={open === c.id}
                      onToggle={() => setParams(open === c.id ? {} : { check: c.id }, { replace: true })}
                    />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function CheckCard({ check, open, onToggle }: { check: HealthCheck; open: boolean; onToggle: () => void }) {
  const all = useRunner()
  const ok = check.count === 0
  return (
    <Card className={cn(open && 'ring-1 ring-accent/30')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggle} disabled={ok} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default" aria-expanded={open}>
          {ok ? (
            <CheckCircle2 className="size-4 shrink-0 text-ok" />
          ) : (
            <ChevronRight className={cn('size-4 shrink-0 text-faint transition-transform', open && 'rotate-90')} />
          )}
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">{check.label}</span>
            <span className="block truncate text-xs text-muted">{check.help}</span>
          </span>
        </button>
        <Badge tone={ok ? 'ok' : check.count > 100 ? 'warn' : 'neutral'} className="tabular-nums">
          {ok ? 'All good' : num(check.count)}
        </Badge>
        {!ok && check.fix_all && (
          <Button size="sm" onClick={() => void all.run(check.fix_all!)} title={commandLine(check.fix_all)}>
            <Wrench className="size-3" /> {check.fix_all_label}
          </Button>
        )}
      </div>
      {all.jobId !== null && <JobInline jobId={all.jobId} className="px-4 pb-3" />}
      {open && !ok && (
        <div className="border-t border-line">
          {check.items.length < check.count && (
            <p className="px-4 pt-2 text-xs text-faint">Showing the newest {check.items.length} of {num(check.count)}.</p>
          )}
          <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto">
            {check.items.map((i) => (
              <ItemRow key={`${i.kind}-${i.slug}`} item={i} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function ItemRow({ item }: { item: HealthItem }) {
  const { jobId, run } = useRunner()
  const [confirm, setConfirm] = useState(false)
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api.removeOrphanFolder(item.slug),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.health }),
  })
  const href = `/${item.kind}/${item.slug}`
  return (
    <li className="px-4 py-2">
      <div className="flex items-center gap-3">
        <Link to={href} className="shrink-0">
          <Cover
            src={item.kind === 'release' ? albumImageUrl(item.slug) : artistImageUrl(item.slug, 'avatar')}
            alt=""
            kind={item.kind === 'release' ? 'album' : 'artist'}
            rounded={item.kind === 'release' ? 'rounded' : 'rounded-full'}
            className="size-9"
          />
        </Link>
        <Link to={href} className="min-w-0 flex-1 hover:underline">
          <span className="block truncate text-[13px] font-medium">{item.title}</span>
          <span className="block truncate text-xs text-muted">{item.subtitle}</span>
        </Link>
        {item.action === 'remove-folder' ? (
          confirm ? (
            <span className="flex items-center gap-1">
              {remove.error && <span className="text-xs text-bad">{remove.error.message}</span>}
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>
                Delete public/album/{item.slug}/
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
              Remove folder
            </Button>
          )
        ) : (
          <Link to={`${href}?tab=edit`} className="text-xs text-muted hover:text-fg">
            Edit
          </Link>
        )}
        {item.fix && (
          <Button size="sm" onClick={() => void run(item.fix!)} title={commandLine(item.fix)}>
            Fix
          </Button>
        )}
      </div>
      <JobInline jobId={jobId} className="mt-2" />
    </li>
  )
}

/** Dashboard summary: the checks with the most to do. */
export function HealthSummary() {
  const { data, isLoading } = useHealth()
  if (isLoading) return <div className="flex h-24 items-center justify-center"><Spinner /></div>
  const top = (data ?? []).filter((c) => c.count > 0).sort((a, b) => b.count - a.count)
  if (top.length === 0) return <EmptyState icon={<HeartPulse className="size-5" />} title="Everything checks out" />
  return (
    <ul className="space-y-0.5 p-2">
      {top.slice(0, 8).map((c) => (
        <li key={c.id}>
          <Link to={`/health?check=${c.id}`} className="flex h-7 items-center justify-between rounded px-2 text-[13px] hover:bg-hover">
            <span className="truncate">
              <span className="text-faint">{c.group === 'Artists' ? 'Artists · ' : ''}</span>
              {c.label}
            </span>
            <span className="text-xs text-faint tabular-nums">{num(c.count)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
