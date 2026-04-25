import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { getCleanGenresFromArray } from "@/lib/genreUtils";
import {
  getAlbumImageFromData,
  handleImageError,
} from "@/lib/image-utils";
import type { Album } from "@/types/album";

interface AlbumCardProps {
  album: Album;
  /** 1-based index retained for callers that still pass catalogue order. */
  index?: number;
  /**
   * Override navigation behaviour. When supplied, the card calls this
   * instead of following its own Link. Used by modal previews.
   */
  onClick?: () => void;
  /**
   * Paint the cover-colour drop shadow. Default true; set false in dense
   * walls where many shadows would start to noise each other.
   */
  tinted?: boolean;
  className?: string;
}

/**
 * Editorial album tile: square cover with tinted float, hover reveal of
 * genre/year/added, grot title + mono subline below.
 * Square corners everywhere; photos are the only "object" on the page.
 */
export function AlbumCard({
  album,
  onClick,
  tinted = true,
  className,
}: AlbumCardProps) {
  const albumPath = album.uri_release.replace("/album/", "").replace("/", "");
  const colors = useAlbumColors(album.uri_release);
  const shadow = tinted && colors ? colors.background : undefined;

  const year = new Date(album.date_release_year).getFullYear();
  const addedDate = formatAddedDate(album.date_added);
  const cleanGenres = getCleanGenresFromArray(
    album.genre_names,
    album.release_artist
  );
  const genre = cleanGenres[0];

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Link
      to={`/album/${albumPath}`}
      onClick={handleClick}
      className={cn("group block font-grot text-ink", className)}
    >
      {/* --- Cover ---------------------------------------------------- */}
      <div
        className="relative aspect-square w-full overflow-hidden bg-paper-2 transition-shadow duration-300"
        style={
          shadow
            ? ({
                boxShadow: `0 22px 44px -18px ${shadow}, 0 2px 6px -2px rgba(14,13,11,0.08)`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <img
          src={getAlbumImageFromData(`/album/${albumPath}/`, "medium")}
          alt={album.release_name}
          width={360}
          height={360}
          loading="lazy"
          draggable={false}
          onError={handleImageError}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />

        {/* Hover metadata strip. Uses the album's pre-computed bg/fg pair
            from album-colors.json so contrast is guaranteed on every cover;
            falls back to ink/paper before the palette loads. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0",
            "translate-y-full px-3 py-2 font-mono text-[10.5px] tracking-[0.04em]",
            "transition-transform duration-300 ease-out",
            "group-hover:translate-y-0"
          )}
          style={{
            backgroundColor: colors?.background ?? "var(--ink)",
            color: colors?.foreground ?? "var(--paper)",
          }}
        >
          {genre && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="opacity-60">GENRE</span>
              <span className="truncate font-medium uppercase">{genre}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <span className="opacity-60">YEAR</span>
            <span className="font-medium">{year || "—"}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="opacity-60">ADDED</span>
            <span className="font-medium">{addedDate}</span>
          </div>
        </div>
      </div>

      {/* --- Meta ----------------------------------------------------- */}
      <div className="mt-3 flex flex-col gap-1">
        <h3 className="line-clamp-2 font-display text-[17px] uppercase leading-[0.98] text-ink transition-colors group-hover:text-hl">
          {album.release_name}
        </h3>
        <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] tracking-[0.02em] text-ink-3">
          <span className="truncate">{album.release_artist}</span>
          {year ? <span className="shrink-0 text-ink-dim">{year}</span> : null}
        </div>
      </div>
    </Link>
  );
}

/** Format an ISO date as `12 APR 26` (UK-style). */
function formatAddedDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d
    .toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
    .toUpperCase();
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}
