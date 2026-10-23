import { CheckCircle2, MinusCircle, PlugZap, XCircle } from 'lucide-react'
import { Link } from 'react-router'
import { Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui'
import { ago, cn } from '@/lib/format'
import { useJobs, useLatestJob } from '@/lib/jobs'

interface ProbeRow {
  name: string
  status: 'ok' | 'failed' | 'skipped'
  detail: string
}

const LABELS: Record<string, string> = {
  discogs: 'Discogs',
  apple_music: 'Apple Music',
  spotify: 'Spotify',
  lastfm: 'Last.fm',
  wikipedia: 'Wikipedia',
  wikidata: 'Wikidata',
  musicbrainz: 'MusicBrainz',
  theaudiodb: 'TheAudioDB',
  perplexity: 'Perplexity',
  youtube: 'YouTube',
}

export function ServicesPage() {
  const { store } = useJobs()
  const job = useLatestJob('probe')
  const running = job?.status === 'running'
  const rows = ((job?.result as { services?: ProbeRow[] } | null)?.services ?? []) as ProbeRow[]
  const healthy = rows.filter((r) => r.status === 'ok').length
  const configured = rows.filter((r) => r.status !== 'skipped').length

  return (
    <div className="mx-auto max-w-5xl pb-12">
      <PageHeader
        title="Services"
        sub={
          job && !running && rows.length > 0
            ? `${healthy}/${configured} configured services healthy · checked ${ago(job.finished_at)}`
            : 'Connectivity and credentials for every API the scrapper uses.'
        }
        actions={
          <Button variant="primary" busy={running} onClick={() => void store.start('probe-services')}>
            <PlugZap className="size-3.5" /> {job ? 'Test again' : 'Test services'}
          </Button>
        }
      />
      <div className="px-6">
        {!job ? (
          <Card>
            <EmptyState icon={<PlugZap className="size-6" />} title="Not tested yet" body="Runs the same live probes as `scrapper test`." />
          </Card>
        ) : running ? (
          <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-muted">
            <Spinner /> Probing services…
          </Card>
        ) : job.status !== 'done' ? (
          <Card className="p-6 text-[13px]">
            The probe {job.status}.{' '}
            <Link to={`/jobs/${job.id}`} className="text-accent hover:underline">
              See the log
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => {
              const Icon = r.status === 'ok' ? CheckCircle2 : r.status === 'failed' ? XCircle : MinusCircle
              return (
                <Card key={r.name} className="flex items-start gap-3 p-4">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', r.status === 'ok' ? 'text-ok' : r.status === 'failed' ? 'text-bad' : 'text-faint')} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{LABELS[r.name] ?? r.name}</p>
                    <p className={cn('mt-0.5 text-xs break-words', r.status === 'failed' ? 'text-bad' : 'text-muted')}>{r.detail}</p>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
