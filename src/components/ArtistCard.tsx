import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { AlbumColorPalette } from "@/hooks/useAlbumColors";
import { handleImageError } from "@/lib/image-utils";
import { floodFor } from "@/lib/sleeveColour";
import { cn } from "@/lib/utils";

interface Artist {
  name: string;
  uri: string;
  albumCount: number;
  /** Photo URL, built by the caller with the image-utils helpers. */
  image: string;
}

interface ArtistCardProps {
  artist: Artist;
  /** Kept for callers that pass catalogue order; not rendered. */
  index?: number;
  /**
   * Palette of the artist's latest record. Its flood colour paints the ring
   * around the photo; without one the ring falls back to the neutral flood.
   */
  palette?: AlbumColorPalette | null;
  onClick?: () => void;
  className?: string;
}

/**
 * Artist in a grid: round photo with a ring in the colour of their latest
 * sleeve, name in bold display type and the record count in mono.
 */
export function ArtistCard({ artist, palette, onClick, className }: ArtistCardProps) {
  const { flood } = floodFor(palette);
  const count = artist.albumCount;

  const content = (
    <div className="flex min-w-0 flex-col items-center text-center" style={{ "--accent": flood } as CSSProperties}>
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-full bg-[var(--ground-3)]",
          "shadow-[0_0_0_3px_var(--ground),0_0_0_6px_var(--accent)]",
          "transition-shadow duration-300 ease-out motion-reduce:transition-none",
          "group-hover:shadow-[0_0_0_3px_var(--ground),0_0_0_10px_var(--accent)]",
          "group-focus-visible:shadow-[0_0_0_3px_var(--ground),0_0_0_10px_var(--accent)]",
        )}
      >
        <img
          src={artist.image}
          alt=""
          width={360}
          height={360}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={handleImageError}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05] motion-reduce:transition-none"
        />
      </div>

      <h3 className="t-dispn mt-5 line-clamp-2 w-full break-words text-[16px] leading-[1.1] md:text-[18px]">
        {artist.name}
      </h3>
      {count > 0 && (
        <span className="t-mono mt-2 text-[11px] uppercase text-[color:var(--cream-dim)]">
          {count.toLocaleString("en-GB")} {count === 1 ? "record" : "records"}
        </span>
      )}
    </div>
  );

  const classes = cn(
    "group block min-w-0 rounded-2xl p-2 text-[color:var(--cream)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cream)]",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={artist.name} className={cn(classes, "w-full")}>
        {content}
      </button>
    );
  }

  return (
    <Link to={artist.uri} aria-label={count > 0 ? `${artist.name}, ${count} ${count === 1 ? "record" : "records"}` : artist.name} className={classes}>
      {content}
    </Link>
  );
}
