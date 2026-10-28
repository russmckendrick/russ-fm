import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * A real image over its atlas cell: the 64px cell shows at once (the atlas is
 * already loaded for the map) and the sharp file fades in over it. If the file
 * fails, the cell stays.
 */
export function AtlasImage({ src, atlas, className, style }: { src: string; atlas: CSSProperties; className?: string; style?: CSSProperties }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  return (
    <span className={cn('relative block overflow-hidden bg-[color:var(--ground-3)]', className)} style={{ ...atlas, ...style }} aria-hidden>
      {state !== 'failed' && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState('ready')}
          onError={() => setState('failed')}
          className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none', state === 'ready' ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </span>
  );
}
