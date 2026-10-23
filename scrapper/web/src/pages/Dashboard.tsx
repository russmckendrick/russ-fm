import { ArrowRight, FileJson, PlugZap } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ReleaseTile } from '@/components/ReleaseTile'
import { Button, Card, CardHeader, ErrorState, PageHeader, Progress, Spinner } from '@/components/ui'
import { num, plural } from '@/lib/format'
import { useJobs, useLatestJob } from '@/lib/jobs'
import { useOverview } from '@/lib/queries'
import type { Count } from '@/lib/types'

export function Dashboard() {
  const { data, error, isLoading } = useOverview()
  if (error) return <ErrorState error={error} />
  if (isLoading || !data) return <Loading />

  const { stats, library, artists, boxsets } = data
  const unprocessed = stats.total_collection_items - stats.processed_items

  return (
    <div className="mx-auto max-w-7xl pb-12">
      <PageHeader
        title="Collection"
        sub={`${plural(library.releases, 'release')} by ${plural(library.artists, 'artist')}`}
        actions={<QuickActions />}
      />

      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-4">
        <Stat label="Releases in the library" value={num(library.releases)} foot={`${num(stats.total_releases)} in the database`} />
        <Stat
          label="Collection processed"
          value={`${num(stats.processed_items)}`}
          of={stats.total_collection_items}
          done={stats.processed_items}
          foot={unprocessed > 0 ? `${num(unprocessed)} waiting` : 'All caught up'}
        />
        <Stat label="Artists enriched" value={num(artists.enriched)} of={artists.total} done={artists.enriched} foot={`of ${num(artists.total)}`} />
        <Stat label="Boxsets linked" value={num(boxsets.processed)} of={boxsets.total} done={boxsets.processed} foot={`of ${num(boxsets.total)} box releases`} />
      </div>

      <section className="mt-8 px-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Recently added</h2>
          <Link to="/library?sort=added" className="flex items-center gap-1 text-xs text-muted hover:text-fg">
            All releases <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-9">
          {data.recent.map((item, i) => (
            <ReleaseTile key={item.slug} item={item} eager={i < 9} />
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-4 px-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Genres" sub="Share of releases" />
          <Bars rows={library.genres.slice(0, 10)} total={library.releases} param="genre" />
        </Card>
        <Card>
          <CardHeader title="Decades" sub="By original release year" />
          <Decades rows={library.decades} />
        </Card>
        <Card>
          <CardHeader title="Formats" sub={`${num(library.coloured_vinyl)} on coloured vinyl`} />
          <Bars rows={library.formats.slice(0, 8)} total={library.releases} param="format" />
        </Card>
      </div>

      <dl className="mt-8 grid gap-x-6 gap-y-1 px-6 text-xs text-faint sm:grid-cols-[auto_1fr]">
        <dt>Data</dt>
        <dd className="truncate font-mono">{data.paths.data_dir}</dd>
        <dt>Database</dt>
        <dd className="truncate font-mono">{data.paths.db}</dd>
      </dl>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  )
}

function Stat({ label, value, foot, of, done }: { label: string; value: ReactNode; foot?: ReactNode; of?: number; done?: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {of !== undefined && done !== undefined && <Progress value={done} total={of} className="mt-2.5" />}
      {foot && <p className="mt-2 text-xs text-faint">{foot}</p>}
    </Card>
  )
}

function Bars({ rows, total, param }: { rows: Count[]; total: number; param: string }) {
  return (
    <ul className="space-y-0.5 p-2">
      {rows.map(([name, n]) => (
        <li key={name}>
          <Link
            to={`/library?${param}=${encodeURIComponent(name)}`}
            className="group relative flex h-7 items-center justify-between overflow-hidden rounded px-2 text-[13px] hover:bg-hover"
          >
            <span
              className="absolute inset-y-1 left-0 rounded-r bg-accent/10 transition-colors group-hover:bg-accent/15"
              style={{ width: `${Math.max(2, (n / total) * 100)}%` }}
            />
            <span className="relative truncate">{name}</span>
            <span className="relative text-xs text-faint tabular-nums">{num(n)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Decades({ rows }: { rows: Count[] }) {
  const max = Math.max(1, ...rows.map(([, n]) => n))
  return (
    <div className="flex h-52 items-end gap-1.5 px-4 pt-4 pb-3">
      {rows.map(([decade, n]) => (
        <Link
          key={decade}
          to={`/library?decade=${decade.slice(0, 4)}`}
          className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${decade}: ${num(n)}`}
        >
          <span className="text-[10px] text-faint tabular-nums opacity-0 transition-opacity group-hover:opacity-100">{num(n)}</span>
          <span
            className="w-full rounded-t bg-accent/25 transition-colors group-hover:bg-accent/45"
            style={{ height: `${(n / max) * 100}%`, minHeight: 2 }}
          />
          <span className="text-[10px] text-faint">{decade.slice(2)}</span>
        </Link>
      ))}
    </div>
  )
}

function QuickActions() {
  const { store } = useJobs()
  const navigate = useNavigate()
  const gen = useLatestJob('generate-collection')
  const probe = useLatestJob('probe')
  return (
    <>
      <Button
        busy={probe?.status === 'running'}
        onClick={async () => {
          if (await store.start('probe-services')) navigate('/services')
        }}
      >
        <PlugZap className="size-3.5" /> Test services
      </Button>
      <Button
        busy={gen?.status === 'running'}
        onClick={() => void store.start('generate-collection')}
        title="Rebuild public/collection.json from the database"
      >
        <FileJson className="size-3.5" /> Generate collection.json
      </Button>
    </>
  )
}
