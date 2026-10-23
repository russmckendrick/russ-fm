import { useQuery } from '@tanstack/react-query'
import { DatabaseBackup, Search, Trash2 } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router'
import { JobInline, useRunner } from '@/components/JobInline'
import { Button, Card, CardHeader, EmptyState, Input, PageHeader, Segmented, Select, Spinner } from '@/components/ui'
import { api, keys } from '@/lib/api'
import { ago, date, num } from '@/lib/format'
import { useOverview } from '@/lib/queries'
import type { DbRow } from '@/lib/types'

type Kind = 'release' | 'artist'

export function DatabasePage() {
  const [kind, setKind] = useState<Kind>('release')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('date_added')
  const dq = useDeferredValue(q.trim())
  const { data: overview } = useOverview()
  const { data: rows, isFetching } = useQuery({
    queryKey: [...keys.db, kind, dq, sort],
    queryFn: () => api.dbRows({ kind, q: dq, sort: kind === 'release' ? sort : sort === 'date_added' ? 'name' : sort, limit: 100 }),
    select: (d) => d.rows,
    placeholderData: (prev) => prev,
  })
  const del = useRunner()
  const stats = overview?.stats

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 pb-12">
      <PageHeader title="Database" sub="The scrapper’s SQLite store — including records that aren’t in collection.json." />

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Releases', stats.total_releases],
            ['Artists', stats.total_artists],
            ['Collection items', stats.total_collection_items],
            ['Processed', stats.processed_items],
          ].map(([label, n]) => (
            <Card key={label} className="p-3">
              <p className="text-xs text-muted">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{num(n as number)}</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Segmented
            value={kind}
            onChange={(k) => {
              setKind(k)
              setSort(k === 'release' ? 'date_added' : 'name')
            }}
            options={[
              { value: 'release', label: 'Releases' },
              { value: 'artist', label: 'Artists' },
            ]}
          />
          <Input
            icon={<Search className="size-3.5" />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={kind === 'release' ? 'Title, artist or Discogs ID…' : 'Artist name or Discogs ID…'}
            className="min-w-48 flex-1"
            aria-label="Search the database"
          />
          {!dq && (
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              {kind === 'release' ? (
                <>
                  <option value="date_added">Recently added</option>
                  <option value="title">Title</option>
                  <option value="year">Year</option>
                </>
              ) : (
                <>
                  <option value="name">Name</option>
                  <option value="created_at">Recently created</option>
                </>
              )}
            </Select>
          )}
          {isFetching && <Spinner />}
        </div>
        {!rows ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No rows match" />
        ) : (
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {rows.map((r) => (
              <Row key={`${kind}-${r.discogs_id ?? r.id}`} kind={kind} row={r} onDelete={(id) => void del.run(['db', 'delete', kind, id, '--force'])} />
            ))}
          </ul>
        )}
        {del.jobId !== null && (
          <div className="border-t border-line p-3">
            <JobInline jobId={del.jobId} />
          </div>
        )}
      </Card>

      <Backups />
    </div>
  )
}

function Row({ kind, row, onDelete }: { kind: Kind; row: DbRow; onDelete: (id: string) => void }) {
  const [confirm, setConfirm] = useState(false)
  const id = kind === 'release' ? row.discogs_id : (row.id ?? row.name)
  const title = kind === 'release' ? row.title : row.name
  const href = row.slug ? `/${kind === 'release' ? 'release' : 'artist'}/${row.slug}` : null
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-[13px]">
      <code className="w-20 shrink-0 truncate font-mono text-[11px] text-faint">{row.discogs_id ?? '—'}</code>
      <span className="min-w-0 flex-1">
        {href ? (
          <Link to={href} className="block truncate font-medium hover:underline">
            {title}
          </Link>
        ) : (
          <span className="block truncate font-medium">
            {title} <span className="text-xs font-normal text-faint">· not in collection.json</span>
          </span>
        )}
        {kind === 'release' && <span className="block truncate text-xs text-muted">{row.artist_names?.join(', ')}</span>}
      </span>
      <span className="hidden w-12 text-right text-xs text-faint tabular-nums sm:block">{kind === 'release' ? (row.year ?? '') : ''}</span>
      <span className="hidden w-24 text-right text-xs text-faint tabular-nums md:block">{date(kind === 'release' ? row.date_added : row.created_at)}</span>
      {id &&
        (confirm ? (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="danger" onClick={() => onDelete(id)}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} title={`Delete this ${kind} (backs up the database first)`}>
            <Trash2 className="size-3.5" />
          </Button>
        ))}
    </li>
  )
}

function Backups() {
  const { data } = useQuery({ queryKey: keys.backups, queryFn: api.backups })
  const { jobId, run } = useRunner()
  return (
    <Card>
      <CardHeader
        title="Backups"
        sub={data?.dir}
        actions={
          <Button size="sm" onClick={() => void run(['backup'])}>
            <DatabaseBackup className="size-3.5" /> Back up now
          </Button>
        }
      />
      {jobId !== null && (
        <div className="border-b border-line p-3">
          <JobInline jobId={jobId} />
        </div>
      )}
      {!data ? (
        <div className="flex h-20 items-center justify-center">
          <Spinner />
        </div>
      ) : data.backups.length === 0 ? (
        <EmptyState title="No backups yet" />
      ) : (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
          {data.backups.map((b) => (
            <li key={b.name} className="flex items-center gap-3 px-4 py-2 text-[13px]">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{b.name}</code>
              <span className="text-xs text-faint tabular-nums">{(b.bytes / 1024 / 1024).toFixed(0)} MB</span>
              <span className="w-24 text-right text-xs text-faint">{ago(b.modified)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
