import type { CSSProperties } from 'react';
import { fadeMask, type HeroPhotoLayout } from '@/lib/artistImage';

interface ArtistHeroPhotoProps {
  src: string;
  layout: HeroPhotoLayout;
  onError?: () => void;
}

/**
 * The desktop artist hero's photo: the artist's TheAudioDB fanart when there is
 * any, else their own photo, in its own colour (no greyscale print, no blend),
 * placed by heroPhotoLayout() on the side its people are on and fading out
 * before the text into a flood of its own colour. Sits in the flood, under the
 * hero's text; phones keep the square portrait (ArtistPortrait).
 */
export function ArtistHeroPhoto({ src, layout, onError }: ArtistHeroPhotoProps) {
  const mask = fadeMask(layout.fadeFrom, layout.fadeTo, layout.side === 'left' ? 'to right' : 'to left');
  const style: CSSProperties = {
    top: 0,
    height: layout.height,
    width: layout.width,
    [layout.side]: layout.offset,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
  return <img src={src} alt="" aria-hidden className="artist-hero-photo" style={style} onError={onError} />;
}
