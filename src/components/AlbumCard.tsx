import type { MouseEvent } from "react";
import { RecordTile } from "@/components/player";
import { useAlbumColorMap } from "@/hooks/useAlbumColors";
import { getCleanGenresFromArray } from "@/lib/genreUtils";
import type { Album } from "@/types/album";

interface AlbumCardProps {
  album: Album;
  /** 1-based index retained for callers that still pass catalogue order. */
  index?: number;
  /**
   * Override navigation behaviour. When supplied, the card calls this
   * instead of following its own link. Used by modal previews.
   */
  onClick?: () => void;
  /** Retained for older callers; the colour bar always uses the sleeve colour. */
  tinted?: boolean;
  className?: string;
}

/**
 * Legacy album card, now a thin wrapper around the player `RecordTile` so
 * pages that still use it match the rest of the site: sleeve with the disc
 * sliding out on hover, a bar in the sleeve's flood colour, title, artist
 * and a mono "year · genre" line.
 */
export function AlbumCard({ album, onClick, className }: AlbumCardProps) {
  const colorMap = useAlbumColorMap();
  const palette = colorMap?.[album.uri_release] ?? null;

  const year = new Date(album.date_release_year).getFullYear();
  const genre = getCleanGenresFromArray(album.genre_names, album.release_artist)[0];
  const meta = [Number.isNaN(year) ? null : year, genre].filter(Boolean).join(" · ");

  const tile = (
    <RecordTile album={album} palette={palette} meta={meta || undefined} className={onClick ? undefined : className} />
  );

  if (!onClick) return tile;

  // Intercept the tile's link so callers can open a preview instead.
  const handleClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onClick();
  };

  return (
    <div className={className} onClickCapture={handleClickCapture}>
      {tile}
    </div>
  );
}
