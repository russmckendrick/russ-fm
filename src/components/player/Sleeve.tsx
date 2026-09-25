import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { handleImageError } from '@/lib/image-utils';

interface SleeveProps {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  shrinkwrap?: boolean;
  loading?: 'lazy' | 'eager';
  srcSet?: string;
  sizes?: string;
  children?: ReactNode;
}

/** A record sleeve: the cover art with a card edge and drop shadow. */
export function Sleeve({ src, alt, className, style, shrinkwrap, loading = 'lazy', srcSet, sizes, children }: SleeveProps) {
  return (
    <div className={cn('sleeve', className)} style={style}>
      <img src={src} srcSet={srcSet} sizes={sizes} alt={alt} loading={loading} decoding="async" onError={handleImageError} />
      {shrinkwrap && <span className="shrinkwrap" aria-hidden />}
      {children}
    </div>
  );
}
