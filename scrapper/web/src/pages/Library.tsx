import { LayoutGrid, List, Search, X } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Cover } from '@/components/Cover'
import { RELEASE_TILE_CAPTION, ReleaseTile } from '@/components/ReleaseTile'
import { Button, EmptyState, ErrorState, Input, PageHeader, Segmented, Select, Spinner, Toggle } from '@/components/ui'
import { VirtualGrid, VirtualList } from '@/components/VirtualGrid'
import { date, num, plural } from '@/lib/format'
import { albumImageUrl } from '@/lib/media'
import { useLibrary } from '@/lib/queries'
import type { LibraryItem } from '@/lib/types'

type Sort = 'added' | 'artist' | 'title' | 'year-desc' | 'year-asc' | 'listeners'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'artist', label: 'Artist A–Z' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'year-desc', label: 'Newest releases' },
  { value: 'year-asc', label: 'Oldest releases' },
  { value: 'listeners', label: 'Most listened (Last.fm)' },
]

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Each search word with how often it was typed: "talk talk" needs "talk" twice. */
function wordCounts(needle: string): [string, number][] {
  const m = new Map<string, number>()
  for (const w of needle.split(/\s+/).filter(Boolean)) m.set(w, (m.get(w) ?? 0) + 1)
  return [...m.entries()]
}

function occurrences(hay: string, word: string): number {
  let n = 0
  for (let at = hay.indexOf(word); at !== -1; at = hay.indexOf(word, at + word.length)) n++
  return n
}

/** Leading "The " is ignored when sorting by artist, as record shops do. */
const sortName = (s: string) => fold(s).replace(/^the\s+/, '')

function counts(items: LibraryItem[], key: (i: LibraryItem) => (string | null)[]) {
  const m = new Map<string, number>()
  for (const i of items) for (const k of key(i)) if (k) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export function LibraryPage() {
  const { data: items, error, isLoading } = useLibrary()
  const [params, setParams] = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)

  const q = params.get('q') ?? ''
  const genre = params.get('genre') ?? ''
  const format = params.get('format') ?? ''
  const decade = params.get('decade') ?? ''
  const colour = params.get('colour') === '1'
  const sort = (params.get('sort') as Sort) || 'added'
  const view = params.get('view') === 'list' ? 'list' : 'grid'
  const deferredQ = useDeferredValue(q)

  const set = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  // "/" focuses search, as on most collection sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const facets = useMemo(() => {
    const all = items ?? []
    return {
      genres: counts(all, (i) => [...new Set([...i.genres, ...i.styles])]),
      formats: counts(all, (i) => [i.format]),
      decades: counts(all, (i) => [i.year ? String(Math.floor(i.year / 10) * 10) : null]).sort((a, b) => a[0].localeCompare(b[0])),
    }
  }, [items])

  const filtered = useMemo(() => {
    if (!items) return []
    const needle = fold(deferredQ.trim())
    const words = wordCounts(needle)
    const dec = decade ? Number(decade) : null
    const out = items.filter((i) => {
      if (genre && !i.genres.includes(genre) && !i.styles.includes(genre)) return false
      if (format && i.format !== format) return false
      if (dec !== null && (!i.year || i.year < dec || i.year >= dec + 10)) return false
      if (colour && i.vinyl_colours.length === 0) return false
      if (needle) {
        const hay = fold(`${i.title} ${i.artist} ${i.labels.join(' ')} ${i.vinyl_colours.join(' ')} ${i.discogs_id ?? ''}`)
        if (!words.every(([w, n]) => occurrences(hay, w) >= n)) return false
      }
      return true
    })
    const by = {
      added: (a: LibraryItem, b: LibraryItem) => (b.date_added ?? '').localeCompare(a.date_added ?? ''),
      artist: (a: LibraryItem, b: LibraryItem) => sortName(a.artist).localeCompare(sortName(b.artist)) || (a.year ?? 0) - (b.year ?? 0),
      title: (a: LibraryItem, b: LibraryItem) => sortName(a.title).localeCompare(sortName(b.title)),
      'year-desc': (a: LibraryItem, b: LibraryItem) => (b.year ?? 0) - (a.year ?? 0),
      'year-asc': (a: LibraryItem, b: LibraryItem) => (a.year ?? 9999) - (b.year ?? 9999),
      listeners: (a: LibraryItem, b: LibraryItem) => (b.listeners ?? 0) - (a.listeners ?? 0),
    }[sort]
    return out.sort(by ?? (() => 0))
  }, [items, deferredQ, genre, format, decade, colour, sort])

  const active = Boolean(q || genre || format || decade || colour)

  if (error) return <ErrorState error={error} />

  return (
    <div className="pb-12">
      <PageHeader
        title="Library"
        sub={items ? (active ? `${num(filtered.length)} of ${plural(items.length, 'release')}` : plural(items.length, 'release')) : ' '}
      />
      <div className="top-0 z-10 md:sticky border-b border-line bg-bg/85 px-6 py-2.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            ref={searchRef}
            icon={<Search className="size-3.5" />}
            placeholder="Search title, artist, label…   /"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="w-full sm:w-72"
            aria-label="Search the library"
          />
          <Select value={genre} onChange={(e) => set('genre', e.target.value)} aria-label="Genre or style">
            <option value="">All genres</option>
            {facets.genres.map(([g, n]) => (
              <option key={g} value={g}>
                {g} ({n})
              </option>
            ))}
          </Select>
          <Select value={format} onChange={(e) => set('format', e.target.value)} aria-label="Format">
            <option value="">All formats</option>
            {facets.formats.map(([f, n]) => (
              <option key={f} value={f}>
                {f} ({n})
              </option>
            ))}
          </Select>
          <Select value={decade} onChange={(e) => set('decade', e.target.value)} aria-label="Decade">
            <option value="">Any decade</option>
            {facets.decades.map(([d, n]) => (
              <option key={d} value={d}>
                {d}s ({n})
              </option>
            ))}
          </Select>
          <Toggle pressed={colour} onChange={(v) => set('colour', v ? '1' : null)} title="Only coloured vinyl">
            ◉ Coloured
          </Toggle>
          {active && (
            <Button variant="ghost" size="sm" onClick={() => setParams(sort === 'added' ? {} : { sort }, { replace: true })}>
              <X className="size-3" /> Clear
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Select value={sort} onChange={(e) => set('sort', e.target.value === 'added' ? null : e.target.value)} aria-label="Sort">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Segmented
              value={view}
              onChange={(v) => set('view', v === 'grid' ? null : v)}
              options={[
                { value: 'grid', label: <LayoutGrid className="size-3.5" />, title: 'Grid' },
                { value: 'list', label: <List className="size-3.5" />, title: 'List' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="px-6 pt-5">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No releases match" body="Try a different search, or clear the filters." />
        ) : view === 'grid' ? (
          <VirtualGrid
            items={filtered}
            extraHeight={RELEASE_TILE_CAPTION}
            getKey={(i) => i.slug}
            render={(item) => <ReleaseTile item={item} />}
          />
        ) : (
          <ListView items={filtered} />
        )}
      </div>
    </div>
  )
}

function ListView({ items }: { items: LibraryItem[] }) {
  return (
    <div>
      <div className="grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1.5fr)_56px_minmax(0,1fr)_96px] items-center gap-3 border-b border-line px-2 pb-2 text-xs text-faint max-md:grid-cols-[40px_minmax(0,1fr)_56px]">
        <span />
        <span>Title</span>
        <span className="max-md:hidden">Artist</span>
        <span>Year</span>
        <span className="max-md:hidden">Format</span>
        <span className="max-md:hidden">Added</span>
      </div>
      <VirtualList
        items={items}
        rowHeight={52}
        getKey={(i) => i.slug}
        render={(i) => (
          <Link
            to={`/release/${i.slug}`}
            className="grid h-full grid-cols-[40px_minmax(0,2fr)_minmax(0,1.5fr)_56px_minmax(0,1fr)_96px] items-center gap-3 rounded-md px-2 text-[13px] hover:bg-hover max-md:grid-cols-[40px_minmax(0,1fr)_56px]"
          >
            <Cover src={albumImageUrl(i.slug)} color={i.color} alt="" rounded="rounded" className="size-10" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{i.title}</span>
              <span className="block truncate text-xs text-faint md:hidden">{i.artist}</span>
            </span>
            <span className="truncate text-muted max-md:hidden">{i.artist}</span>
            <span className="text-muted tabular-nums">{i.year ?? '—'}</span>
            <span className="truncate text-muted max-md:hidden">
              {i.format ?? '—'}
              {i.vinyl_colours.length > 0 && <span className="text-faint"> · {i.vinyl_colours.join(', ')}</span>}
            </span>
            <span className="text-xs text-faint tabular-nums max-md:hidden">{date(i.date_added)}</span>
          </Link>
        )}
      />
    </div>
  )
}
