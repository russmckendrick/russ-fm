import { Disc3, User } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/format'

/**
 * Square artwork with a colour placeholder (the album's dominant colour when known) that fades
 * the image in once loaded, and falls back to an icon when there's no file.
 */
export function Cover({
  src,
  color,
  alt,
  kind = 'album',
  className,
  rounded = 'rounded-md',
  eager,
}: {
  src: string
  color?: string | null
  alt: string
  kind?: 'album' | 'artist'
  className?: string
  rounded?: string
  eager?: boolean
}) {
  const [state, setState] = useState<'loading' | 'loaded' | 'missing'>('loading')
  const Icon = kind === 'album' ? Disc3 : User
  return (
    <div
      className={cn('relative aspect-square overflow-hidden bg-panel-2', rounded, className)}
      style={color ? { backgroundColor: color } : undefined}
    >
      {state !== 'missing' && (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('missing')}
          className={cn('size-full object-cover transition-opacity duration-300', state === 'loaded' ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {state === 'missing' && (
        <div className="absolute inset-0 flex items-center justify-center text-faint">
          <Icon className="size-1/3 opacity-50" strokeWidth={1.25} />
        </div>
      )}
      <div className={cn('pointer-events-none absolute inset-0 ring-1 ring-black/5 ring-inset dark:ring-white/5', rounded)} />
    </div>
  )
}
