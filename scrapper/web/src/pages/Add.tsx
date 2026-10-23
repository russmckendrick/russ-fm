import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Disc3, RefreshCw, Sparkles, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { commandLine } from '@/components/CommandForm'
import { JobInline, useRunner } from '@/components/JobInline'
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select, Spinner } from '@/components/ui'
import { api, keys } from '@/lib/api'
import { ago, cn, date } from '@/lib/format'
import type { ClassifiedCandidate } from '@/lib/types'

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

/** The TUI Collection screen: new releases in Discogs, pick and process — sorted into new
 * ones, ones already in the library under another Discogs ID, and ones stored without matches. */
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
  const fresh = items.filter((i) => i.state === 'new')
  const dupes = items.filter((i) => i.state === 'duplicate')
  const unmatched = items.filter((i) => i.state === 'unmatched')
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const chosen = items.filter((i) => picked.has(i.release_id))
  const allFresh = fresh.length > 0 && fresh.every((i) => picked.has(i.release_id))

  return (
    <Card>
      <CardHeader
        title="New in your Discogs collection"
        sub={`The newest releases that aren’t enriched yet${data ? ` · checked ${ago(new Date(dataUpdatedAt).toISOString())}` : ''}`}
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
        <EmptyState icon={<Disc3 className="size-6" />} title="All caught up" body="Your newest Discogs releases are all in the library and enriched." />
      ) : (
        <div className="max-h-[32rem] overflow-y-auto">
          <Section
            title="New"
            count={fresh.length}
            hint="Not in the library yet."
            lead={
              fresh.length > 0 && (
                <input
                  type="checkbox"
                  aria-label="Select all new"
                  checked={allFresh}
                  onChange={() =>
                    setPicked((p) => {
                      const n = new Set(p)
                      for (const i of fresh) if (allFresh) n.delete(i.release_id)
                      else n.add(i.release_id)
                      return n
                    })
                  }
                  className="size-3.5 accent-[var(--accent)]"
                />
              )
            }
          >
            {fresh.map((c) => (
              <CandidateRow key={c.release_id} c={c} checked={picked.has(c.release_id)} onToggle={() => toggle(c.release_id)} />
            ))}
          </Section>
          <Section
            title="Already in your library under another Discogs ID"
            count={dupes.length}
            hint="Usually a submission Discogs merged into the release now in your collection. Replace moves the library copy onto the collection’s ID."
          >
            {dupes.map((c) => (
              <DuplicateRow key={c.release_id} c={c} checked={picked.has(c.release_id)} onToggle={() => toggle(c.release_id)} />
            ))}
          </Section>
          <Section
            title="In the library, but nothing matched"
            count={unmatched.length}
            hint="Processed before without an Apple Music, Spotify or Last.fm match. Select to try matching again."
            collapsed
          >
            {unmatched.map((c) => (
              <CandidateRow key={c.release_id} c={c} checked={picked.has(c.release_id)} onToggle={() => toggle(c.release_id)} inLibrary />
            ))}
          </Section>
        </div>
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

function Section({
  title,
  count,
  hint,
  lead,
  collapsed,
  children,
}: {
  title: string
  count: number
  hint: string
  lead?: ReactNode
  collapsed?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(!collapsed)
  if (count === 0) return null
  return (
    <section className="border-b border-line last:border-b-0">
      <div className="sticky top-0 z-[1] flex items-center gap-3 bg-panel-2/90 px-4 py-2 backdrop-blur">
        {lead}
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <ChevronRight className={cn('size-3.5 shrink-0 text-faint transition-transform', open && 'rotate-90')} />
          <span className="text-xs font-medium">{title}</span>
          <Badge>{count}</Badge>
          <span className="hidden truncate text-xs text-faint md:inline">{hint}</span>
        </button>
      </div>
      {open && <ul className="divide-y divide-line">{children}</ul>}
    </section>
  )
}

function CandidateRow({
  c,
  checked,
  onToggle,
  inLibrary,
}: {
  c: ClassifiedCandidate
  checked: boolean
  onToggle: () => void
  inLibrary?: boolean
}) {
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
        {inLibrary && c.slug ? (
          <Link
            to={`/release/${c.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-muted hover:text-accent"
          >
            Open
          </Link>
        ) : null}
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

const sameDay = (a: string | null, b: string | null) => Boolean(a && b && a.slice(0, 10) === b.slice(0, 10))

function DuplicateRow({ c, checked, onToggle }: { c: ClassifiedCandidate; checked: boolean; onToggle: () => void }) {
  const [confirm, setConfirm] = useState<string | null>(null)
  const { jobId, start } = useRunner()
  const [likely, ...others] = c.existing
  const item = { ...c, state: undefined, slug: undefined, existing: undefined }
  const target = c.existing.find((e) => e.discogs_id === confirm)

  return (
    <li className="space-y-2 px-4 py-2.5">
      <div className="flex items-center gap-3 text-[13px]">
        <input type="checkbox" checked={checked} onChange={onToggle} className="size-3.5 accent-[var(--accent)]" title="Process as a separate release instead" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{c.title}</span>
          <span className="block truncate text-xs text-muted">
            {c.artist} · {c.format}
          </span>
        </span>
        <span className="hidden w-24 text-right text-xs text-faint tabular-nums md:block">{date(c.date_added)}</span>
        <a href={`https://www.discogs.com/release/${c.release_id}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-faint hover:text-accent">
          {c.release_id}
        </a>
      </div>
      <ul className="ml-6 space-y-1">
        {[likely, ...others].map((e, i) => (
          <li key={e.discogs_id} className="flex flex-wrap items-center gap-2 rounded-md bg-panel-2/60 px-2.5 py-1.5 text-xs">
            {i === 0 && (sameDay(e.date_added, c.date_added) || others.length === 0) ? <Badge tone="warn">Likely</Badge> : <Badge>Other pressing?</Badge>}
            <Link to={`/release/${e.slug}`} className="min-w-0 flex-1 truncate hover:underline">
              <span className="font-medium">{e.title}</span> <span className="text-muted">· {e.artists.join(', ')}</span>{' '}
              <span className="text-faint">
                · [{e.discogs_id}] · added {date(e.date_added)}
              </span>
            </Link>
            {confirm === e.discogs_id ? null : (
              <Button size="sm" variant={i === 0 ? 'secondary' : 'ghost'} onClick={() => setConfirm(e.discogs_id)}>
                Replace with {c.release_id}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {target && (
        <div className="ml-6 flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1">
            Process <strong>[{c.release_id}]</strong> and save it, keep the old record’s description and boxset links, then delete{' '}
            <strong>[{target.discogs_id}]</strong> and <code className="font-mono">public/album/{target.slug}/</code>. The database is backed up first.
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setConfirm(null)
              void start('replace-release', { old_id: target.discogs_id, item })
            }}
          >
            Replace
          </Button>
        </div>
      )}
      <JobInline jobId={jobId} className="ml-6" />
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
