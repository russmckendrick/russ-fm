import { useQuery } from '@tanstack/react-query'
import { Disc3, RefreshCw, Sparkles, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { commandLine } from '@/components/CommandForm'
import { JobInline, useRunner } from '@/components/JobInline'
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select, Spinner } from '@/components/ui'
import { api, keys } from '@/lib/api'
import { ago, cn, date } from '@/lib/format'
import type { CollectionCandidate } from '@/lib/types'

const PREFER = ['', 'apple-music', 'spotify', 'theaudiodb', 'discogs', 'v1']

export function AddPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 pb-12">
      <PageHeader title="Add & enrich" sub="Bring new records in from Discogs and fill in what's missing. Service matches you need to choose pop up as you go." />
      <NewInDiscogs />
      <div className="grid gap-6 lg:grid-cols-2">
        <AddRelease />
        <EnrichArtists />
      </div>
      <FullRun />
    </div>
  )
}

/** The TUI Collection screen: new releases in Discogs, pick and process. */
function NewInDiscogs() {
  const { data, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: keys.newInCollection,
    queryFn: api.newInCollection,
    staleTime: 5 * 60_000,
    select: (d) => d.items,
  })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [newest, setNewest] = useState('5')
  const { jobId, start } = useRunner()
  const items = data ?? []
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const chosen = items.filter((i) => picked.has(i.release_id))

  return (
    <Card>
      <CardHeader
        title="New in your Discogs collection"
        sub={`The newest releases that aren’t enriched yet: not processed, or processed without any service match${data ? ` · checked ${ago(new Date(dataUpdatedAt).toISOString())}` : ''}`}
        actions={
          <Button size="sm" variant="ghost" onClick={() => void refetch()} busy={isFetching} title="Check Discogs again">
            {!isFetching && <RefreshCw className="size-3" />} Refresh
          </Button>
        }
      />
      {error ? (
        <EmptyState title="Couldn't reach Discogs" body={error instanceof Error ? error.message : String(error)} />
      ) : !data ? (
        <div className="flex h-32 items-center justify-center gap-2 text-[13px] text-muted">
          <Spinner /> Checking Discogs…
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Disc3 className="size-6" />} title="All caught up" body="Your newest Discogs releases are all enriched." />
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-line px-4 py-2 text-xs text-muted">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={picked.size === items.length}
              ref={(el) => {
                if (el) el.indeterminate = picked.size > 0 && picked.size < items.length
              }}
              onChange={() => setPicked(picked.size === items.length ? new Set() : new Set(items.map((i) => i.release_id)))}
              className="size-3.5 accent-[var(--accent)]"
            />
            <span>{items.length} to process</span>
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items.map((c) => (
              <CandidateRow key={c.release_id} c={c} checked={picked.has(c.release_id)} onToggle={() => toggle(c.release_id)} />
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button variant="primary" disabled={chosen.length === 0} onClick={() => void start('process-releases', { items: chosen })}>
          Process {chosen.length || ''} selected
        </Button>
        <span className="mx-1 text-xs text-faint">or the newest</span>
        <Input value={newest} onChange={(e) => setNewest(e.target.value.replace(/\D/g, ''))} className="w-16" aria-label="How many" inputMode="numeric" />
        <Button onClick={() => void start('process-releases', { newest: Number(newest) || 1 })}>Process newest</Button>
        <span className="ml-auto text-xs text-faint">Force-refreshed and saved, like the TUI’s Collection screen</span>
      </div>
      {jobId !== null && (
        <div className="border-t border-line p-4">
          <JobInline jobId={jobId} />
        </div>
      )}
    </Card>
  )
}

function CandidateRow({ c, checked, onToggle }: { c: CollectionCandidate; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className={cn('flex cursor-pointer items-center gap-3 px-4 py-2 text-[13px]', checked ? 'bg-accent-soft/40' : 'hover:bg-hover')}>
        <input type="checkbox" checked={checked} onChange={onToggle} className="size-3.5 accent-[var(--accent)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{c.title}</span>
          <span className="block truncate text-xs text-muted">{c.artist}</span>
        </span>
        <span className="hidden truncate text-xs text-faint sm:block sm:max-w-48">{c.format}</span>
        <span className="w-10 text-right text-xs text-faint tabular-nums">{c.year ?? ''}</span>
        <span className="hidden w-24 text-right text-xs text-faint tabular-nums md:block">{date(c.date_added)}</span>
        <a
          href={`https://www.discogs.com/release/${c.release_id}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[11px] text-faint hover:text-accent"
        >
          {c.release_id}
        </a>
      </label>
    </li>
  )
}

/** "123456", "r123456" or a discogs.com/release URL → the release ID. */
export function parseReleaseId(text: string): string | null {
  const t = text.trim()
  const url = t.match(/discogs\.com\/(?:[\w-]+\/)?release\/(\d+)/i)
  if (url) return url[1]
  const bare = t.match(/^\[?r?(\d+)\]?$/i)
  return bare ? bare[1] : null
}

/** `scrapper release <id>` with the options people actually use. */
function AddRelease() {
  const [input, setInput] = useState('')
  const [interactive, setInteractive] = useState(true)
  const [save, setSave] = useState(true)
  const [force, setForce] = useState(false)
  const [prefer, setPrefer] = useState('')
  const [boxset, setBoxset] = useState('')
  const [cover, setCover] = useState('')
  const { jobId, run } = useRunner()

  const id = parseReleaseId(input)
  const args = id
    ? [
        'release',
        id,
        ...(save ? ['--save'] : []),
        ...(interactive ? ['--interactive'] : []),
        ...(force ? ['--force-refresh'] : []),
        ...(prefer ? ['--prefer', prefer] : []),
        ...(parseReleaseId(boxset) ? ['--boxset', parseReleaseId(boxset)!] : []),
        ...(cover.trim() ? ['--custom-cover', cover.trim()] : []),
      ]
    : []

  return (
    <Card>
      <CardHeader title="Add a release" sub="By Discogs release ID or URL" />
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (id) void run(args)
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="38794683 or https://www.discogs.com/release/38794683-…" aria-label="Release ID or URL" />
        <div className="flex flex-wrap gap-1.5">
          <Check on={save} set={setSave} label="Save" hint="Write to the database, public/ and collection.json" />
          <Check on={interactive} set={setInteractive} label="Pick matches" hint="Choose Apple Music / Spotify matches and review the description" />
          <Check on={force} set={setForce} label="Force refresh" hint="Refetch everything (implies save)" />
        </div>
        <details className="group text-[13px]">
          <summary className="cursor-pointer text-xs text-muted select-none hover:text-fg">More options</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Labelled label="Preferred artwork">
              <Select value={prefer} onChange={(e) => setPrefer(e.target.value)} className="w-full max-w-none">
                {PREFER.map((p) => (
                  <option key={p} value={p}>
                    {p || 'Automatic'}
                  </option>
                ))}
              </Select>
            </Labelled>
            <Labelled label="Member of boxset (ID)">
              <Input value={boxset} onChange={(e) => setBoxset(e.target.value)} placeholder="Box release ID" />
            </Labelled>
            <Labelled label="Custom cover URL" className="sm:col-span-2">
              <Input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://…" />
            </Labelled>
          </div>
        </details>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={!id}>
            {save || force ? 'Add release' : 'Preview release'}
          </Button>
          {id && <code className="truncate font-mono text-[11px] text-faint">{commandLine(args)}</code>}
        </div>
        <JobInline jobId={jobId} />
      </form>
    </Card>
  )
}

/** The TUI Enrich artists runner, plus one artist by name. */
function EnrichArtists() {
  const [count, setCount] = useState('10')
  const [name, setName] = useState('')
  const [perplexity, setPerplexity] = useState(false)
  const [tadb, setTadb] = useState(false)
  const batch = useRunner()
  const one = useRunner()

  return (
    <Card>
      <CardHeader title="Enrich artists" sub="Apple Music, Spotify, Last.fm, Wikipedia and photos" />
      <div className="space-y-5 p-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">Artists with nothing yet</p>
          <div className="flex items-center gap-2">
            <Input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} className="w-16" inputMode="numeric" aria-label="How many artists" />
            <Button onClick={() => void batch.start('enrich-artists', { limit: Number(count) || 1 })}>
              <Users className="size-3.5" /> Enrich next {Number(count) || 1}
            </Button>
          </div>
          <JobInline jobId={batch.jobId} />
        </div>
        <form
          className="space-y-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim())
              void one.run(['artist', name.trim(), '--save', '--interactive', ...(perplexity ? ['--perplexity'] : []), ...(tadb ? ['--theaudiodb'] : [])])
          }}
        >
          <p className="text-xs font-medium text-muted">One artist</p>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Artist name, e.g. Talk Talk" aria-label="Artist name" />
          <div className="flex flex-wrap items-center gap-1.5">
            <Check on={perplexity} set={setPerplexity} label={<><Sparkles className="size-3" /> Perplexity bio</>} hint="Write the biography with Perplexity" />
            <Check on={tadb} set={setTadb} label="TheAudioDB" hint="Also look up TheAudioDB" />
            <Button type="submit" className="ml-auto" disabled={!name.trim()}>
              Enrich
            </Button>
          </div>
          <JobInline jobId={one.jobId} />
        </form>
      </div>
    </Card>
  )
}

/** The headless resume-aware collection pass (`scrapper collection --resume`). */
function FullRun() {
  const { jobId, run } = useRunner()
  return (
    <Card>
      <CardHeader
        title="Whole collection"
        sub="Headless and resume-aware: first matches are taken automatically, already-enriched releases are skipped"
        actions={
          <>
            <Button size="sm" onClick={() => void run(['collection', '--resume', '--dry-run'])}>
              Dry run
            </Button>
            <Button size="sm" variant="primary" onClick={() => void run(['collection', '--resume'])}>
              Resume collection
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 p-4 text-xs text-muted">
        <Badge>scrapper collection --resume</Badge>
        More options (ranges, limits, force refresh) are on the <Link to="/tools/collection" className="text-accent hover:underline">Tools</Link> page.
      </div>
      {jobId !== null && (
        <div className="border-t border-line p-4">
          <JobInline jobId={jobId} />
        </div>
      )}
    </Card>
  )
}

function Check({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: ReactNode; hint?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={hint}
      onClick={() => set(!on)}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors',
        on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg',
      )}
    >
      <span className={cn('size-1.5 rounded-full', on ? 'bg-accent' : 'bg-line-strong')} />
      {label}
    </button>
  )
}

function Labelled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1 text-xs text-muted">{label}</p>
      {children}
    </div>
  )
}
