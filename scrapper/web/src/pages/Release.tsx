import { ArrowLeft, Check, ExternalLink, Minus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Cover } from '@/components/Cover'
import { JsonView } from '@/components/JsonView'
import { Tabs } from '@/components/Tabs'
import { Badge, EmptyState, ErrorState, LinkChip, Spinner } from '@/components/ui'
import { cn, date, num } from '@/lib/format'
import { albumImageUrl, siteUrl } from '@/lib/media'
import { useRelease } from '@/lib/queries'
import type { AlbumJson, LibraryItem, Track } from '@/lib/types'

type Tab = 'overview' | 'tracks' | 'videos' | 'data'

export function ReleasePage() {
  const { slug = '' } = useParams()
  const { data, error, isLoading } = useRelease(slug)
  const [tab, setTab] = useState<Tab>('overview')

  if (isLoading) return <Centered><Spinner /></Centered>
  if (error) return <ErrorState error={error} />
  if (!data) return null

  const pub: AlbumJson = data.public ?? {}
  const item = data.item
  const title = pub.title ?? item?.title ?? slug
  const artists = item?.artists ?? []
  const tracks = pub.tracklist ?? []
  const videos = uniqueVideos(pub.videos ?? [])
  const description = pub.services?.perplexity?.description ?? pub.services?.lastfm?.wiki_summary

  return (
    <div className="pb-16">
      <Hero color={item?.color}>
        <Link to="/library" className="mb-5 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ArrowLeft className="size-3" /> Library
        </Link>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <Cover
            src={albumImageUrl(slug, 'hi-res')}
            color={item?.color}
            alt={title}
            eager
            rounded="rounded-lg"
            className="w-48 shrink-0 shadow-xl sm:w-60"
          />
          <div className="min-w-0 pb-1">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">{item?.format ?? pub.formats?.[0] ?? 'Release'}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{title}</h1>
            <p className="mt-1.5 text-[15px]">
              {artists.length > 0
                ? artists.map((a, i) => (
                    <span key={a.name}>
                      {i > 0 && ', '}
                      {a.slug ? (
                        <Link to={`/artist/${a.slug}`} className="font-medium hover:underline">
                          {a.name}
                        </Link>
                      ) : (
                        a.name
                      )}
                    </span>
                  ))
                : item?.artist}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              {[item?.year ?? pub.year, pub.released && date(pub.released), pub.country, pub.labels?.join(', ')]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <LinkChip href={siteUrl('album', slug)}>
                russ.fm <ExternalLink className="size-3" />
              </LinkChip>
              {pub.discogs_url && <LinkChip href={pub.discogs_url}>Discogs</LinkChip>}
              {pub.apple_music_url && <LinkChip href={pub.apple_music_url}>Apple Music</LinkChip>}
              {pub.spotify_url && <LinkChip href={pub.spotify_url}>Spotify</LinkChip>}
              {pub.lastfm_url && <LinkChip href={pub.lastfm_url}>Last.fm</LinkChip>}
            </div>
          </div>
        </div>
      </Hero>

      <div className="mx-auto max-w-5xl px-6">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'tracks', label: 'Tracklist', count: countTracks(tracks) },
            { value: 'videos', label: 'Videos', count: videos.length },
            { value: 'data', label: 'Data' },
          ]}
        />
        <div className="pt-6">
          {tab === 'overview' && <Overview pub={pub} item={item} description={description} hasRecord={data.record !== null} tracks={tracks.length} videos={videos.length} />}
          {tab === 'tracks' && <Tracklist tracks={tracks} />}
          {tab === 'videos' && <Videos urls={videos} />}
          {tab === 'data' && (
            <div className="grid gap-4">
              {data.record ? <JsonView title="Database record (releases table)" value={data.record} /> : <EmptyState title="Not in the database" />}
              {data.public && <JsonView title={`public/album/${slug}/${slug}.json`} value={data.public} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-64 items-center justify-center">{children}</div>
}

/** A soft wash of the artwork's colour behind the header. */
export function Hero({ color, children }: { color?: string | null; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden">
      {color && (
        <div
          className="pointer-events-none absolute inset-0 opacity-25 dark:opacity-30"
          style={{ background: `radial-gradient(120% 90% at 0% 0%, ${color}, transparent 70%)` }}
        />
      )}
      <div className="relative mx-auto max-w-5xl px-6 pt-6 pb-8">{children}</div>
    </div>
  )
}

function Overview({
  pub,
  item,
  description,
  hasRecord,
  tracks,
  videos,
}: {
  pub: AlbumJson
  item: LibraryItem | null
  description?: string
  hasRecord: boolean
  tracks: number
  videos: number
}) {
  const genres = pub.genres ?? item?.genres ?? []
  const styles = pub.styles ?? item?.styles ?? []
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
        {description ? (
          <div className="max-w-prose space-y-3 text-[14px] leading-relaxed text-fg/90">
            {description.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-faint">No description yet.</p>
        )}

        {(pub.format_details?.length ?? 0) > 0 && (
          <section className="mt-8">
            <h3 className="mb-2 text-xs font-medium text-muted">Pressing</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {pub.format_details!.map((f, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
                  <span className="font-medium">
                    {f.qty && f.qty !== '1' ? `${f.qty} × ` : ''}
                    {f.name}
                  </span>
                  {f.descriptions?.map((d) => <Badge key={d}>{d}</Badge>)}
                  {f.colour && <Badge tone="accent">◉ {f.colour}</Badge>}
                  {f.text && <span className="text-xs text-faint">{f.text}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="space-y-6 text-[13px]">
        <Facts
          rows={[
            ['Added', date(pub.date_added ?? item?.date_added)],
            ['Discogs ID', pub.discogs_id ?? item?.discogs_id ?? '—'],
            ['Last.fm listeners', num(pub.services?.lastfm?.listeners ?? item?.listeners)],
            ['Updated', date(pub.updated_at)],
          ]}
        />
        {(genres.length > 0 || styles.length > 0) && (
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted">Genres &amp; styles</h3>
            <div className="flex flex-wrap gap-1">
              {genres.map((g) => (
                <Link key={g} to={`/library?genre=${encodeURIComponent(g)}`}>
                  <Badge className="hover:text-fg">{g}</Badge>
                </Link>
              ))}
              {styles.map((s) => (
                <Link key={s} to={`/library?genre=${encodeURIComponent(s)}`}>
                  <Badge className="opacity-80 hover:text-fg">{s}</Badge>
                </Link>
              ))}
            </div>
          </div>
        )}
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted">Sources</h3>
          <ul className="space-y-1">
            <Source ok={hasRecord} label="Database record" />
            <Source ok={Boolean(pub.apple_music_url)} label="Apple Music" />
            <Source ok={Boolean(pub.spotify_url)} label="Spotify" />
            <Source ok={Boolean(pub.lastfm_url)} label="Last.fm" />
            <Source ok={Boolean(pub.services?.perplexity?.description)} label="Description" />
            <Source ok={tracks > 0} label="Tracklist" />
            <Source ok={videos > 0} label="Videos" />
          </ul>
        </div>
      </aside>
    </div>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="truncate text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Source({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={cn('flex items-center gap-2', ok ? 'text-fg' : 'text-faint')}>
      {ok ? <Check className="size-3.5 text-ok" /> : <Minus className="size-3.5" />}
      {label}
    </li>
  )
}

function countTracks(tracks: Track[]): number {
  return tracks.reduce((n, t) => n + (t.type_ === 'heading' ? 0 : t.sub_tracks?.length || 1), 0)
}

function Tracklist({ tracks }: { tracks: Track[] }) {
  if (tracks.length === 0) return <EmptyState title="No tracklist" />
  const row = (t: Track, key: string, sub = false) => (
    <li key={key} className={cn('grid grid-cols-[48px_minmax(0,1fr)_64px] items-baseline gap-3 px-3 py-2 text-[13px]', sub && 'pl-8')}>
      <span className="text-xs text-faint tabular-nums">{t.position}</span>
      <span className="min-w-0">
        <span className="block truncate">{t.title}</span>
        {(t.artists?.length ?? 0) > 0 && (
          <span className="block truncate text-xs text-muted">{t.artists!.map((a) => a.name).filter(Boolean).join(', ')}</span>
        )}
      </span>
      <span className="text-right text-xs text-faint tabular-nums">{t.duration}</span>
    </li>
  )
  return (
    <ol className="divide-y divide-line rounded-lg border border-line bg-panel">
      {tracks.map((t, i) =>
        t.type_ === 'heading' ? (
          <li key={i} className="bg-panel-2 px-3 py-1.5 text-xs font-medium text-muted">
            {t.title}
          </li>
        ) : (
          [row(t, String(i)), ...(t.sub_tracks ?? []).map((s, j) => row(s, `${i}-${j}`, true))]
        ),
      )}
    </ol>
  )
}

function uniqueVideos(videos: AlbumJson['videos'] & {}): string[] {
  const urls = videos.map((v) => (typeof v === 'string' ? v : (v.uri ?? v.url ?? ''))).filter(Boolean)
  return [...new Set(urls)]
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)
  return m ? m[1] : null
}

function Videos({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <EmptyState title="No videos" body="Backfill videos from Discogs or TheAudioDB to fill this in." />
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {urls.map((url) => {
        const id = youtubeId(url)
        return (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="group block">
            <div className="aspect-video overflow-hidden rounded-md bg-panel-2">
              {id && <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" className="size-full object-cover transition-opacity group-hover:opacity-90" />}
            </div>
            <p className="mt-1.5 truncate font-mono text-xs text-muted">{id ?? url}</p>
          </a>
        )
      })}
    </div>
  )
}
