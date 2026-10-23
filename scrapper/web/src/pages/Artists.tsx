import { Search } from 'lucide-react'
import { useDeferredValue, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Cover } from '@/components/Cover'
import { EmptyState, ErrorState, Input, PageHeader, Select, Spinner } from '@/components/ui'
import { VirtualGrid } from '@/components/VirtualGrid'
import { num, plural } from '@/lib/format'
import { artistImageUrl } from '@/lib/media'
import { useArtists } from '@/lib/queries'
import type { LibraryArtist } from '@/lib/types'

type Sort = 'name' | 'releases' | 'added'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function ArtistsPage() {
  const { data: artists, error, isLoading } = useArtists()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const sort = (params.get('sort') as Sort) || 'name'
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

  const filtered = useMemo(() => {
    if (!artists) return []
    const needle = fold(deferredQ.trim())
    const out = needle ? artists.filter((a) => fold(a.name).includes(needle)) : [...artists]
    const by: Record<Sort, (a: LibraryArtist, b: LibraryArtist) => number> = {
      name: (a, b) => fold(a.name).replace(/^the\s+/, '').localeCompare(fold(b.name).replace(/^the\s+/, '')),
      releases: (a, b) => b.release_count - a.release_count || a.name.localeCompare(b.name),
      added: (a, b) => (b.latest_added ?? '').localeCompare(a.latest_added ?? ''),
    }
    return out.sort(by[sort] ?? by.name)
  }, [artists, deferredQ, sort])

  if (error) return <ErrorState error={error} />

  return (
    <div className="pb-12">
      <PageHeader title="Artists" sub={artists ? (q ? `${num(filtered.length)} of ${plural(artists.length, 'artist')}` : plural(artists.length, 'artist')) : ' '} />
      <div className="top-0 z-10 md:sticky flex flex-wrap items-center gap-2 border-b border-line bg-bg/85 px-6 py-2.5 backdrop-blur-md">
        <Input
          icon={<Search className="size-3.5" />}
          placeholder="Search artists…"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          className="w-full sm:w-72"
          aria-label="Search artists"
        />
        <Select value={sort} onChange={(e) => set('sort', e.target.value === 'name' ? null : e.target.value)} className="ml-auto" aria-label="Sort">
          <option value="name">Name A–Z</option>
          <option value="releases">Most releases</option>
          <option value="added">Recently added to</option>
        </Select>
      </div>
      <div className="px-6 pt-5">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No artists match" />
        ) : (
          <VirtualGrid
            items={filtered}
            minItem={150}
            extraHeight={44}
            getKey={(a) => a.slug}
            render={(a) => (
              <Link to={`/artist/${a.slug}`} className="group block text-center">
                <Cover
                  src={artistImageUrl(a.slug)}
                  alt={a.name}
                  kind="artist"
                  rounded="rounded-full"
                  className="shadow-sm transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <p className="mt-2 truncate text-[13px] leading-5 font-medium">{a.name}</p>
                <p className="truncate text-xs leading-4 text-faint">{plural(a.release_count, 'release')}</p>
              </Link>
            )}
          />
        )}
      </div>
    </div>
  )
}
