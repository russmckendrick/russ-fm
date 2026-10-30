import { Network, Palette, ScanFace } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { EntityPicker, type Picked } from './EntityPicker'
import { JobInline, useRunner } from './JobInline'
import { Button, Card, CardHeader } from './ui'

type Script = 'generate-colors' | 'generate-artist-images'

/** The site's own asset scripts, run in the repo root: sleeve colours, artist photo notes and the explore graph. */
export function SiteScripts() {
  return (
    <Card>
      <CardHeader title="Site assets" sub="The russ.fm build scripts that read what the scrapper writes. Commit their output with the scrapper’s." />
      <div className="grid divide-line md:grid-cols-2 md:divide-x">
        <ScriptPanel
          script="generate-colors"
          kind="release"
          icon={<Palette className="size-4" />}
          title="Album colours"
          body="Sleeve palettes and swatches (album-colors.json, album-swatches.json). New albums only, unless you pick one or redo all."
          allLabel="Redo all (--force)"
        />
        <ScriptPanel
          script="generate-artist-images"
          kind="artist"
          icon={<ScanFace className="size-4" />}
          title="Artist photo notes"
          body="Where faces sit in each photo, for placement and colour (<slug>-image.json). macOS only. New photos only, unless you pick one or redo all."
          allLabel="Redo all (--full)"
        />
      </div>
      <ExplorePanel />
    </Card>
  )
}

/** generate-explore has no per-entity mode: it always rebuilds the whole graph. */
function ExplorePanel() {
  const { jobId, start } = useRunner()
  return (
    <div className="space-y-3 border-t border-line p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-faint">
          <Network className="size-4" />
        </span>
        <div>
          <p className="text-[13px] font-medium">
            Explore graph <code className="ml-1 font-mono text-[11px] font-normal text-faint">pnpm generate-explore</code>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            The /explore links and Galaxy map (public/explore/: explore.json plus the sleeve and avatar atlases), from album credits and the
            artists’ Discogs members, groups and aliases. Gitignored and rebuilt on deploy; run it here to see new records locally.
          </p>
        </div>
      </div>
      <Button variant="primary" onClick={() => void start('site-script', { script: 'generate-explore' })}>
        Rebuild explore graph
      </Button>
      <JobInline jobId={jobId} />
    </div>
  )
}

function ScriptPanel({
  script,
  kind,
  icon,
  title,
  body,
  allLabel,
}: {
  script: Script
  kind: 'release' | 'artist'
  icon: ReactNode
  title: string
  body: string
  allLabel: string
}) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const { jobId, start } = useRunner()
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-faint">{icon}</span>
        <div>
          <p className="text-[13px] font-medium">
            {title} <code className="ml-1 font-mono text-[11px] font-normal text-faint">pnpm {script}</code>
          </p>
          <p className="mt-0.5 text-xs text-muted">{body}</p>
        </div>
      </div>
      <EntityPicker kind={kind} value={picked} onChange={setPicked} placeholder={kind === 'release' ? 'One album (optional)…' : 'One artist (optional)…'} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void start('site-script', { script, only: picked?.slug })}>
          {picked ? `Redo ${kind === 'release' ? 'this album' : 'this artist'}` : 'Run for new ones'}
        </Button>
        {!picked && <Button onClick={() => void start('site-script', { script, all: true })}>{allLabel}</Button>}
      </div>
      <JobInline jobId={jobId} />
    </div>
  )
}
