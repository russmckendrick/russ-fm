import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Search, Undo2 } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Cover } from '@/components/Cover'
import { JobInline, useRunner } from '@/components/JobInline'
import { Tabs } from '@/components/Tabs'
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Spinner } from '@/components/ui'
import { api, keys } from '@/lib/api'
import { date, plural } from '@/lib/format'
import { useJobs } from '@/lib/jobs'
import { albumImageUrl } from '@/lib/media'
import type { BoxsetRow } from '@/lib/types'

type Tab = 'unprocessed' | 'processed' | 'single'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Which tab a box belongs on (boxes without album headers can't be discovered, so they're not listed). */
function tabOf(b: BoxsetRow): Tab | null {
  if (b.single_release) return 'single'
  if (b.processed) return 'processed'
  return b.has_headers ? 'unprocessed' : null
}

export function BoxsetsPage() {
  const { data, error, isLoading } = useQuery({ queryKey: keys.boxsets, queryFn: api.boxsets, select: (d) => d.boxsets })
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'unprocessed'
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)

  const byTab = useMemo(() => {
    const out: Record<Tab, BoxsetRow[]> = { unprocessed: [], processed: [], single: [] }
    for (const b of data ?? []) {
      const t = tabOf(b)
      if (t) out[t].push(b)
    }
    return out
  }, [data])

  const rows = useMemo(() => {
    const needle = fold(dq.trim())
    return byTab[tab].filter((b) => !needle || fold(`${b.title} ${b.artist_names.join(' ')} ${b.discogs_id}`).includes(needle))
  }, [byTab, tab, dq])

  if (error) return <ErrorState error={error} />

  return (
    <div className="mx-auto max-w-5xl pb-12">
      <PageHeader
        title="Boxsets"
        sub="Find the albums inside a box set and link them as members. Members keep their own pages but don’t count twice in stats."
      />
      <div className="flex flex-wrap items-end justify-between gap-3 px-6">
        <Tabs
          value={tab}
          onChange={(t) => setParams(t === 'unprocessed' ? {} : { tab: t }, { replace: true })}
          tabs={[
            { value: 'unprocessed', label: 'Unprocessed', count: byTab.unprocessed.length },
            { value: 'processed', label: 'Processed', count: byTab.processed.length },
            { value: 'single', label: 'Single release', count: byTab.single.length },
          ]}
        />
        <Input icon={<Search className="size-3.5" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search boxsets…" className="mb-1.5 w-full sm:w-64" aria-label="Search boxsets" />
      </div>
      <div className="px-6 pt-4">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Boxes className="size-6" />}
            title={q ? 'No boxsets match' : tab === 'unprocessed' ? 'Nothing left to discover' : 'None here yet'}
            body={tab === 'single' ? 'Flag a box as a single release when it’s one album in a box edition.' : undefined}
          />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {rows.map((b) => (
              <BoxRow key={b.discogs_id} box={b} tab={tab} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function BoxRow({ box, tab }: { box: BoxsetRow; tab: Tab }) {
  const { jobId, run } = useRunner()
  const { store } = useJobs()
  const qc = useQueryClient()
  const single = useMutation({
    mutationFn: (v: boolean) => api.setBoxsetSingle(box.discogs_id, v),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: keys.boxsets })
      store.toast({ tone: 'info', title: v ? `${box.title} is a single release` : `${box.title} is a box set again` })
    },
  })
  const discover = (refetch: boolean) => void run(['release', '--boxset', box.discogs_id, '--save', ...(refetch ? ['--force-refresh'] : [])])

  return (
    <li className="p-3">
      <div className="flex items-center gap-3">
        {box.slug ? (
          <Link to={`/release/${box.slug}`} className="shrink-0">
            <Cover src={albumImageUrl(box.slug)} alt="" className="size-12" rounded="rounded" />
          </Link>
        ) : (
          <div className="size-12 shrink-0 rounded bg-panel-2" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">
            {box.slug ? (
              <Link to={`/release/${box.slug}`} className="hover:underline">
                {box.title}
              </Link>
            ) : (
              box.title
            )}
          </p>
          <p className="truncate text-xs text-muted">
            {box.artist_names.join(', ')}
            {box.year ? ` · ${box.year}` : ''} · added {date(box.date_added)}
          </p>
        </div>
        {box.member_count > 0 && <Badge tone="ok">{plural(box.member_count, 'member')}</Badge>}
        <div className="flex shrink-0 gap-1.5">
          {tab === 'single' ? (
            <Button size="sm" onClick={() => single.mutate(false)} busy={single.isPending}>
              <Undo2 className="size-3" /> Box set again
            </Button>
          ) : (
            <>
              {tab === 'unprocessed' && (
                <Button size="sm" variant="ghost" onClick={() => single.mutate(true)} busy={single.isPending} title="It's one album in a box edition: don't offer discovery">
                  Single release
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => discover(true)} title="Refetch the box from Discogs, then discover">
                Refetch
              </Button>
              <Button size="sm" variant={tab === 'unprocessed' ? 'primary' : 'secondary'} onClick={() => discover(false)}>
                {tab === 'processed' ? 'Re-run' : 'Discover albums'}
              </Button>
            </>
          )}
        </div>
      </div>
      <JobInline jobId={jobId} className="mt-3" />
    </li>
  )
}
