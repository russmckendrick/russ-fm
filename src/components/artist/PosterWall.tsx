import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { FitTitle } from '@/components/player';
import { getArtistWallUrl } from '@/lib/image-utils';
import type { ArtistWall } from '@/lib/artistWalls';
import { cn } from '@/lib/utils';

export interface PosterSleeve {
  key: string;
  src: string;
  title: string;
  href: string;
}

interface PosterWallProps {
  wall: ArtistWall;
  /** The artist's photo (their fanart, else their own), and where to crop it (an object-position). */
  photo: string;
  photoPosition?: string;
  onPhotoError?: () => void;
  /** Overprinted on the poster; it is the page's h1. */
  name: string;
  /** The newest records, printed small along the bottom (up to four). */
  sleeves: PosterSleeve[];
  /** The page's flood: the name's off-register shadow and the wall's tint. */
  tint: string;
  /** Pixels at the top covered by the see-through header (its height by default); the poster centres below them. */
  topInset?: number;
  /** How far past covering the box the wall is drawn: 1 shows the most wall. */
  zoom?: number;
  className?: string;
}

/**
 * The photo covers the box (times `zoom`), with the poster centred across and a
 * little above the middle of what the header leaves, the photo still covering it.
 */
function layout(wall: ArtistWall, w: number, fullH: number, zoom: number, inset: number) {
  const width = Math.max(w, fullH * wall.aspect) * zoom;
  const height = width / wall.aspect;
  const p = wall.poster;
  const left = Math.min(0, Math.max(w - width, w / 2 - ((p.left + p.width / 2) / 100) * width));
  const top = Math.min(0, Math.max(fullH - height, inset + (fullH - inset) * 0.47 - ((p.top + p.height / 2) / 100) * height));
  const poster = { left: left + (p.left / 100) * width, top: top + (p.top / 100) * height, width: (p.width / 100) * width, height: (p.height / 100) * height };
  return { img: { left, top, width, height }, poster };
}

/**
 * The artist hero: the artist's fly-poster pasted on a wall (src/lib/artistWalls.ts),
 * after the album page's ReleaseRoom. The wall photo has the poster cut out
 * (only the green, so torn corners keep the wall), and sits over:
 *  - the poster: the photo printed onto paper, the name overprinted in cream a
 *    little off register in the flood, the newest sleeves along the bottom, and
 *    a scuffed-ink texture lifting the print back towards the paper;
 *  - the wall's own light and creases on the poster (the shade layer, multiplied).
 * A colour layer tints the whole wall, poster too, with the flood, as on /tv.
 */
export function PosterWall({ wall, photo, photoPosition, onPhotoError, name, sleeves, tint, topInset, zoom = 1.06, className }: PosterWallProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // The wall shows once its photo has decoded and the poster's photo has
  // loaded (or failed), so neither shows without the other.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [printed, setPrinted] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The sticky header: 64px, 84px from md.
  const inset = topInset ?? (size && size.w >= 768 ? 84 : 64);
  const g = size ? layout(wall, size.w, size.h, zoom, inset) : null;
  const src = getArtistWallUrl(wall.id, 'hi-res');
  const medium = getArtistWallUrl(wall.id, 'medium');
  // The poster runs 3px under the cut-out's edge so no wall-coloured seam shows.
  const bleed = 3;

  return (
    <div ref={box} className={cn('artist-wall relative overflow-hidden', className)} style={tint && tint !== 'transparent' ? ({ '--room-wash': tint } as CSSProperties) : undefined}>
      {g && (
        <div className={cn('artist-wall-layer', loaded === wall.id && printed === photo && 'is-on')}>
          <div
            className="artist-poster"
            style={
              {
                left: g.poster.left - bleed,
                top: g.poster.top - bleed,
                width: g.poster.width + bleed * 2,
                height: g.poster.height + bleed * 2,
                '--u': `${(g.poster.width + bleed * 2) / 100}px`,
                '--flood': tint,
              } as CSSProperties
            }
          >
            <img
              src={photo}
              alt=""
              className="artist-poster-photo"
              style={{ objectPosition: photoPosition }}
              onLoad={() => setPrinted(photo)}
              onError={() => (onPhotoError ? onPhotoError() : setPrinted(photo))}
              decoding="async"
            />
            <div className="artist-poster-foot">
              <div className="min-w-0 flex-1">
                <FitTitle max={Math.round(g.poster.width * 0.16)} min={16} className="artist-poster-name">
                  {name}
                </FitTitle>
              </div>
              {sleeves.length > 0 && (
                <div className="artist-poster-sleeves">
                  {sleeves.slice(0, 4).map(s => (
                    <Link key={s.key} to={s.href} title={s.title} aria-label={s.title}>
                      <img src={s.src} alt="" decoding="async" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="artist-poster-wear" aria-hidden />
          </div>
          <div
            className="artist-wall-shade"
            aria-hidden
            style={{ ...g.poster, backgroundImage: `url(${getArtistWallUrl(wall.id, 'shade')})` }}
          />
          <img
            key={wall.id}
            src={src}
            srcSet={`${medium} 3072w, ${src} 4608w`}
            sizes={`${Math.round(g.img.width)}px`}
            alt=""
            className="artist-wall-photo"
            style={g.img}
            decoding="async"
            onLoad={e =>
              // Wait for the decode too: a big photo can be loaded but not yet painted.
              e.currentTarget
                .decode()
                .catch(() => {})
                .then(() => setLoaded(wall.id))
            }
          />
          <div className="artist-wall-tint" aria-hidden style={{ ...g.img, background: tint }} />
        </div>
      )}
    </div>
  );
}
