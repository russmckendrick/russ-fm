import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Album } from '@/types/album';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { floodFor } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import { Sleeve } from './Sleeve';
import { Vinyl } from './Vinyl';

interface RecordTileProps {
  album: Pick<Album, 'uri_release' | 'release_name' | 'release_artist'>;
  palette?: AlbumColorPalette | null;
  /** Mono line under the artist, e.g. "25 SEP · VINYL". */
  meta?: ReactNode;
  showArtist?: boolean;
  showText?: boolean;
  className?: string;
  /** Override the link target (defaults to the album page). */
  to?: string;
}

/**
 * A record in a row or grid: the sleeve with its disc tucked behind (slides
 * out on hover), a colour bar in the sleeve's flood colour and the title.
 */
export function RecordTile({ album, palette, meta, showArtist = true, showText = true, className, to }: RecordTileProps) {
  const { flood, ground } = floodFor(palette);
  const title = album.release_name.trim();
  return (
    <Link to={to ?? album.uri_release} className={cn('rec group block min-w-0', className)}>
      <div className="relative aspect-square w-full">
        {/* Hidden behind the sleeve until hover, so it never spins: a wall of
            spinning discs costs a compositor layer and a repaint each. */}
        <Vinyl label={ground} spin={false} />
        <Sleeve
          src={getAlbumImageFromData(album.uri_release, 'medium')}
          alt={`${title} by ${album.release_artist}`}
          className="h-full w-full"
        />
      </div>
      <div className="mt-2.5 h-1 w-full" style={{ background: flood }} aria-hidden />
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
