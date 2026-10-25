import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, Sparkles, Undo2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { api, keys } from '@/lib/api'
import type { ImageChoices, ImageInfo } from '@/lib/types'
import { JobInline, useRunner } from './JobInline'
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from './ui'

/**
 * Every image of an artist (photo and TheAudioDB fanart) or album (cover) with its size, and
 * beside each an Upscale button (Upscayl's Real-ESRGAN on the GPU, a few seconds an image, the
 * original kept under backups/upscale-originals/ and restorable here). For an artist, any image
 * can be chosen as the site's desktop hero, and any fanart as the artist photo (avatar, cards,
 * phone hero): the choices are stored on the artist, nothing on disk is replaced, and the photo
 * notes are redone so the site follows.
 */
export function ImagesPanel({ kind, slug }: { kind: 'artist' | 'album'; slug: string }) {
  const { data, error, isLoading } = useQuery({ queryKey: keys.images(kind, slug), queryFn: () => api.images(kind, slug) })
  // Bumped after each change so the browser fetches the new file rather than its cached copy.
  const [version, setVersion] = useState(0)
  const qc = useQueryClient()
  const { jobId, start } = useRunner()
  const choose = useMutation({
    mutationFn: async (edit: { field: 'hero' | 'photo'; text: string }) => {
      await api.saveEdit('artist', slug, [edit])
      await start('site-script', { script: 'generate-artist-images', only: slug })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.images(kind, slug) }),
  })

  if (isLoading) return <Spinner />
  if (error) return <ErrorState error={error} />
  if (!data?.images.length) return <EmptyState title="No images on disk" />
  const choices = data.choices ?? {}

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        {data.upscaler
          ? `Upscaling is unavailable: ${data.upscaler}`
          : `Upscales with ${data.model} (Real-ESRGAN, local). Photos and covers under 1000px go to 2000px; fanart to 2560×1440. Originals are kept.`}
      </p>
      {kind === 'artist' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            Hero: <span className="text-fg">{choices.hero ?? 'automatic'}</span> · Artist photo:{' '}
            <span className="text-fg">{choices.photo ?? 'downloaded'}</span>
          </span>
          {choices.hero && (
            <Button size="sm" variant="ghost" disabled={choose.isPending} onClick={() => choose.mutate({ field: 'hero', text: '' })}>
              Hero back to automatic
            </Button>
          )}
          {choices.photo && (
            <Button size="sm" variant="ghost" disabled={choose.isPending} onClick={() => choose.mutate({ field: 'photo', text: '' })}>
              Use the downloaded photo
            </Button>
          )}
        </div>
      )}
      {choose.error && <p className="text-xs text-bad">{choose.error instanceof Error ? choose.error.message : String(choose.error)}</p>}
      <JobInline jobId={jobId} />
      <div className="grid gap-4 sm:grid-cols-2">
        {data.images.map((img) => (
          <ImageCard
            key={img.path}
            img={img}
            kind={kind}
            slug={slug}
            version={version}
            choices={choices}
            choosing={choose.isPending}
            onChoose={(field, text) => choose.mutate({ field, text })}
            onChange={() => setVersion((v) => v + 1)}
            disabled={!!data.upscaler}
          />
        ))}
      </div>
    </div>
  )
}

/** `fanart02` from `artist-fanart02.jpg`, or null for the photo. */
const fanartKey = (file: string) => /-(fanart\d\d)\.jpg$/.exec(file)?.[1] ?? null

function ImageCard({
  img,
  kind,
  slug,
  version,
  choices,
  choosing,
  onChoose,
  onChange,
  disabled,
}: {
  img: ImageInfo
  kind: 'artist' | 'album'
  slug: string
  version: number
  choices: ImageChoices
  choosing: boolean
  onChoose: (field: 'hero' | 'photo', text: string) => void
  onChange: () => void
  disabled: boolean
}) {
  const qc = useQueryClient()
  const done = () => {
    onChange()
    qc.invalidateQueries({ queryKey: keys.images(kind, slug) })
  }
  const upscale = useMutation({ mutationFn: (force: boolean) => api.upscaleImage(img.path, force), onSuccess: done })
  const restore = useMutation({ mutationFn: () => api.restoreImage(img.path), onSuccess: done })
  const failure = upscale.error ?? restore.error
  const busy = upscale.isPending || restore.isPending
  const fanart = fanartKey(img.file)
  const heroKey = fanart ?? 'photo'

  return (
    <Card className="overflow-hidden">
      <div className="relative bg-panel-2">
        <img
          src={`/media/${img.path}?v=${version}`}
          alt={img.file}
          loading="lazy"
          className={img.kind === 'fanart' ? 'aspect-video w-full object-cover' : 'aspect-square w-full object-contain'}
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Spinner />
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{img.file}</span>
          <Badge>
            {img.width}×{img.height}
          </Badge>
          {img.hero && <Badge tone="accent">site hero{choices.hero === heroKey ? ' · chosen' : ''}</Badge>}
          {img.photo && kind === 'artist' && <Badge tone="accent">artist photo{fanart && choices.photo === fanart ? ' · chosen' : ''}</Badge>}
          {img.upscaled && <Badge tone="ok">upscaled</Badge>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {img.target ? (
            <Button size="sm" variant="primary" busy={upscale.isPending} disabled={disabled || busy} onClick={() => upscale.mutate(false)}>
              <Sparkles className="size-3.5" /> Upscale to {img.target[0]}×{img.target[1]}
            </Button>
          ) : (
            <Button size="sm" busy={upscale.isPending} disabled={disabled || busy} onClick={() => upscale.mutate(true)} title="Already at its target size">
              <Sparkles className="size-3.5" /> Upscale 2× anyway
            </Button>
          )}
          {img.upscaled && (
            <Button size="sm" variant="ghost" busy={restore.isPending} disabled={busy} onClick={() => restore.mutate()}>
              <Undo2 className="size-3.5" /> Restore original
            </Button>
          )}
          {kind === 'artist' && choices.hero !== heroKey && (
            <Button size="sm" disabled={choosing} onClick={() => onChoose('hero', heroKey)} title="The image the site's desktop artist hero shows">
              <Crown className="size-3.5" /> Use as hero
            </Button>
          )}
          {kind === 'artist' && fanart && choices.photo !== fanart && (
            <Button size="sm" disabled={choosing} onClick={() => onChoose('photo', fanart)} title="The site's avatar, artist cards and phone hero use this instead of the downloaded photo (no file is replaced)">
              <UserRound className="size-3.5" /> Use as artist photo
            </Button>
          )}
        </div>
        {failure && <p className="text-xs text-bad">{failure instanceof Error ? failure.message : String(failure)}</p>}
      </div>
    </Card>
  )
}
