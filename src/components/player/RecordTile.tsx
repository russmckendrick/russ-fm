import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Album } from '@/types/album';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';
import { colourBar, floodFor } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import { discLook } from '@/lib/vinylLook';
import { Sleeve } from './Sleeve';
import { Vinyl } from './Vinyl';

interface RecordTileProps {
  album: Pick<Album, 'uri_release' | 'release_name' | 'release_artist' | 'vinyl_colours' | 'vinyl_discs' | 'boxset_contents'>;
  palette?: AlbumColorPalette | null;
  /** Mono line under the artist, e.g. "25 SEP · VINYL". */
  meta?: ReactNode;
  showArtist?: boolean;
  showText?: boolean;
  className?: string;
  /** Override the link target (defaults to the album page). */
  to?: string;
  /** `flood` paints the whole card in the sleeve's colour (as the hero bar). */
  variant?: 'plain' | 'flood';
}

/** The most discs or member sleeves a tile fans out (an 18LP box shows four). */
const MAX_POP = 4;

/**
 * Where each popped disc or member sleeve lands on hover, by how many there
 * are, on the artist cards' geometry (`FAN` in ArtistCard), lifted further clear: [x, y] as a share
 * of the item, its tilt in degrees and its stacking order (middle on top).
 */
const POP_FAN: Record<number, Array<[number, number, number, number]>> = {
  1: [[0, -84, 0, 1]],
  2: [[-30, -76, -12, 1], [30, -76, 12, 2]],
  3: [[0, -86, 0, 3], [-50, -66, -20, 1], [50, -66, 20, 2]],
  4: [[-18, -84, -6, 3], [18, -84, 6, 4], [-56, -64, -22, 1], [56, -64, 22, 2]],
};

/**
 * A record in a row or grid: the sleeve with its disc tucked behind (slides
 * out on hover), a colour bar in the sleeve's colours (flood, plus the
 * secondary colour when there is one) and the title.
 */
export function RecordTile({ album, palette, meta, showArtist = true, showText = true, className, to, variant = 'plain' }: RecordTileProps) {
  const colours = floodFor(palette);
  const title = album.release_name.trim();
  // The disc only shows once it slides out on hover, so a coloured pressing is
  // painted then: a wall of tiles never carries a pattern it has not shown.
  const [peeked, setPeeked] = useState(false);
  const look = useMemo(() => (peeked ? discLook(album.vinyl_colours, 0) : null), [peeked, album.vinyl_colours]);
  if (variant === 'flood') {
    // A box set fans out the sleeves of the albums inside it; anything else
    // pushes out one disc per LP, in each disc's pressing colour.
    const box = (album.boxset_contents ?? []).slice(0, MAX_POP);
    const discs = box.length ? 0 : Math.min(MAX_POP, Math.max(1, album.vinyl_discs ?? 1));
    const fan = POP_FAN[box.length || discs];
    const cover = getAlbumImageFromData(album.uri_release, 'medium');
    const pop = (i: number) =>
      ({ '--px': `${fan[i][0]}%`, '--py': `${fan[i][1]}%`, '--pr': `${fan[i][2]}deg`, '--i': i, zIndex: fan[i][3] }) as CSSProperties;
    return (
      <Link
        to={to ?? album.uri_release}
        className={cn('rec rec-flood group block min-w-0', className)}
        style={{ '--card': colours.flood, '--card-2': colours.secondary ?? colours.flood } as CSSProperties}
        onPointerEnter={() => setPeeked(true)}
        onFocus={() => setPeeked(true)}
      >
        <div className="rec-flood-mat">
          <div className="rec-flood-stack relative aspect-square w-full">
            <div className="rec-pop" aria-hidden>
              {box.map((member, i) => (
                <div key={member.uri_release} className="sleeve" style={pop(i)}>
                  {peeked && <img src={getAlbumImageFromData(member.uri_release, 'medium')} alt="" decoding="async" onError={handleImageError} />}
                </div>
              ))}
              {Array.from({ length: discs }, (_, i) => (
                <Vinyl
                  key={i}
                  label={colours.ground}
                  cover={peeked ? cover : null}
                  look={peeked ? discLook(album.vinyl_colours, i) : null}
                  spin={false}
                  className="vinyl-lit"
                  style={pop(i)}
                />
              ))}
            </div>
            <Sleeve src={cover} alt={`${title} by ${album.release_artist}`} className="h-full w-full" />
          </div>
        </div>
        {showText && (
          <div className="mt-4 flex min-w-0 flex-col gap-1">
            <span className="truncate text-[15px] font-bold leading-snug">{title}</span>
            {showArtist && <span className="truncate text-[14px] text-[color:var(--cream-dim)]">{album.release_artist}</span>}
            {meta && <span className="t-mono truncate text-[11px] uppercase text-[color:var(--cream-dim)]">{meta}</span>}
          </div>
        )}
      </Link>
    );
  }
  return (
    <Link
      to={to ?? album.uri_release}
      className={cn('rec group block min-w-0', className)}
      style={palette?.flood ? ({ '--card': palette.flood } as CSSProperties) : undefined}
      onPointerEnter={() => setPeeked(true)}
      onFocus={() => setPeeked(true)}
    >
      <div className="relative aspect-square w-full">
        {/* Hidden behind the sleeve until hover, so it never spins: a wall of
            spinning discs costs a compositor layer and a repaint each. */}
        <Vinyl label={colours.ground} look={look} spin={false} />
        <Sleeve
          src={getAlbumImageFromData(album.uri_release, 'medium')}
          alt={`${title} by ${album.release_artist}`}
          className="h-full w-full"
        />
      </div>
      <div className="mt-2.5 h-1 w-full" style={{ background: colourBar(colours) }} aria-hidden />
      {showText && (
        <div className="mt-3 flex min-w-0 flex-col gap-1">
          <span className="truncate text-[15px] font-bold leading-snug">{title}</span>
          {showArtist && <span className="truncate text-[14px] text-[color:var(--cream-dim)]">{album.release_artist}</span>}
          {meta && <span className="t-mono truncate text-[11px] uppercase text-[color:var(--cream-dim)]">{meta}</span>}
        </div>
      )}
    </Link>
  );
}
