import { Boxes, Palette, RefreshCw, ScanFace, Sparkles } from 'lucide-react'
import { JobInline, useRunner } from './JobInline'
import { Button, Select } from './ui'

/** `scrapper release <id> --field <f>` choices, as the CLI names them. */
const FIELDS: [string, string][] = [
  ['tracks', 'Tracklist'],
  ['videos', 'Videos'],
  ['discogs', 'Everything from Discogs'],
  ['apple', 'Apple Music match'],
  ['spotify', 'Spotify match'],
  ['lastfm', 'Last.fm match'],
  ['images', 'Artwork'],
]

/** What you can run for one release, with the latest run shown underneath. */
export function ReleaseActions({ discogsId, slug, isBox, inDb }: { discogsId: string; slug: string; isBox: boolean; inDb: boolean }) {
  const { jobId, run, start } = useRunner()
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void run(['release', discogsId, '--force-refresh', '--interactive'])} title="Refetch everything and choose matches again (scrapper release --force-refresh --interactive)">
          <RefreshCw className="size-3" /> {inDb ? 'Re-enrich' : 'Add to database'}
        </Button>
        {inDb && (
          <Select
            className="h-7 text-xs"
            value=""
            onChange={(e) => e.target.value && void run(['release', discogsId, '--field', e.target.value, '--interactive'])}
            aria-label="Refresh one field"
            title="Refresh one field and keep everything else (scrapper release --field)"
          >
            <option value="">Refresh one field…</option>
            {FIELDS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        )}
        {inDb && (
          <Button size="sm" variant="ghost" onClick={() => void run(['enrich-description', discogsId, '--force'])} title="Write a new Perplexity description (scrapper enrich-description --force)">
            <Sparkles className="size-3" /> New description
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void start('site-script', { script: 'generate-colors', only: slug })} title={`pnpm generate-colors --only ${slug}`}>
          <Palette className="size-3" /> Redo colours
        </Button>
        {isBox && inDb && (
          <Button size="sm" variant="ghost" onClick={() => void run(['release', '--boxset', discogsId, '--save'])} title="Find the albums in this box and link them (scrapper release --boxset)">
            <Boxes className="size-3" /> Discover albums
          </Button>
        )}
      </div>
      <JobInline jobId={jobId} />
    </div>
  )
}

/** What you can run for one artist. */
export function ArtistActions({ name, slug }: { name: string; slug: string }) {
  const { jobId, run, start } = useRunner()
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void run(['artist', name, '--save', '--force-refresh', '--interactive'])} title="Refetch and choose matches again (scrapper artist --save --force-refresh --interactive)">
          <RefreshCw className="size-3" /> Re-enrich
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void run(['artist', name, '--save', '--interactive', '--perplexity'])} title="Re-enrich and write the biography with Perplexity">
          <Sparkles className="size-3" /> Perplexity bio
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void start('site-script', { script: 'generate-artist-images', only: slug })} title={`pnpm generate-artist-images --only ${slug} (macOS)`}>
          <ScanFace className="size-3" /> Redo photo notes
        </Button>
      </div>
      <JobInline jobId={jobId} />
    </div>
  )
}
