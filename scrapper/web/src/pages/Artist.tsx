import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Cover } from '@/components/Cover'
import { ArtistActions } from '@/components/DetailActions'
import { JsonView } from '@/components/JsonView'
import { RecordEditor } from '@/components/RecordEditor'
import { ImagesPanel } from '@/components/ImagesPanel'
import { ReleaseTile } from '@/components/ReleaseTile'
import { Tabs } from '@/components/Tabs'
import { Badge, EmptyState, ErrorState, LinkChip, Spinner } from '@/components/ui'
import { num, plural } from '@/lib/format'
import { artistImageUrl, siteUrl } from '@/lib/media'
import { useArtist } from '@/lib/queries'
import { Hero } from './Release'

type Tab = 'releases' | 'about' | 'images' | 'edit' | 'data'

export function ArtistPage() {
  const { slug = '' } = useParams()
  const { data, error, isLoading } = useArtist(slug)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'releases'
  const setTab = (t: Tab) => setParams(t === 'releases' ? {} : { tab: t }, { replace: true })
  const [bioOpen, setBioOpen] = useState(false)

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    )
  if (error) return <ErrorState error={error} />
  if (!data) return null

  const pub = data.public ?? {}
  const name = pub.name ?? data.summary?.name ?? slug
  const bio = pub.biography ?? ''
  // The newest release's colour tints the header.
  const color = data.releases.find((r) => r.color)?.color
  const genres = [...new Set((pub.genres ?? []).map((g) => g.toLowerCase()))].slice(0, 8)

  return (
    <div className="pb-16">
      <Hero color={color}>
        <Link to="/artists" className="mb-5 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ArrowLeft className="size-3" /> Artists
        </Link>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <Cover
            src={data.photo ? `/media/artist/${slug}/${data.photo.file}` : artistImageUrl(slug, 'hi-res')}
            position={data.photo?.focus ? `${Math.round(data.photo.focus[0] * 100)}% ${Math.round(data.photo.focus[1] * 100)}%` : undefined}
            alt={name}
            kind="artist"
            eager
            rounded="rounded-full"
            className="w-40 shrink-0 shadow-xl sm:w-48"
          />
          <div className="min-w-0 pb-1">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Artist</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{name}</h1>
            <p className="mt-2 text-[13px] text-muted">
              {[
                plural(data.releases.length, 'release'),
                pub.country,
                pub.formed_date && `formed ${pub.formed_date}`,
                pub.followers && `${num(pub.followers)} Spotify followers`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {genres.map((g) => (
                  <Badge key={g}>{g}</Badge>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-1.5">
              <LinkChip href={siteUrl('artist', slug)}>
                russ.fm <ExternalLink className="size-3" />
              </LinkChip>
              {pub.discogs_url && <LinkChip href={pub.discogs_url}>Discogs</LinkChip>}
              {pub.apple_music_url && <LinkChip href={pub.apple_music_url}>Apple Music</LinkChip>}
              {pub.spotify_url && <LinkChip href={pub.spotify_url}>Spotify</LinkChip>}
              {pub.lastfm_url && <LinkChip href={pub.lastfm_url}>Last.fm</LinkChip>}
              {pub.wikipedia_url && <LinkChip href={pub.wikipedia_url}>Wikipedia</LinkChip>}
            </div>
          </div>
        </div>
        <div className="mt-6">
          <ArtistActions name={name} slug={slug} />
        </div>
      </Hero>

      <div className="mx-auto max-w-5xl px-6">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'releases', label: 'Releases', count: data.releases.length },
            { value: 'about', label: 'About' },
            { value: 'images', label: 'Images' },
            { value: 'edit', label: 'Edit' },
            { value: 'data', label: 'Data' },
          ]}
        />
        <div className="pt-6">
          {tab === 'releases' &&
            (data.releases.length === 0 ? (
              <EmptyState title="No releases in the library" />
            ) : (
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {[...data.releases]
                  .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
                  .map((r) => (
                    <ReleaseTile key={r.slug} item={r} />
                  ))}
              </div>
            ))}
          {tab === 'about' &&
            (bio ? (
              <div className="max-w-prose">
                <div className={bioOpen ? '' : 'line-clamp-[12]'}>
                  {bio.split(/\n{2,}/).map((p, i) => (
                    <p key={i} className="mb-3 text-[14px] leading-relaxed text-fg/90">
                      {p}
                    </p>
                  ))}
                </div>
                {bio.length > 1200 && (
                  <button onClick={() => setBioOpen((o) => !o)} className="text-[13px] text-accent hover:underline">
                    {bioOpen ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            ) : (
              <EmptyState title="No biography yet" />
            ))}
          {tab === 'images' && <ImagesPanel kind="artist" slug={slug} />}
          {tab === 'edit' && <RecordEditor kind="artist" slug={slug} />}
          {tab === 'data' && (
            <div className="grid gap-4">
              {data.record ? <JsonView title="Database record (artists table)" value={data.record} /> : <EmptyState title="Not in the database" />}
              {data.public && <JsonView title={`public/artist/${slug}/${slug}.json`} value={data.public} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
