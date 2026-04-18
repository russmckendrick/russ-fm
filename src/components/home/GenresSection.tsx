import { Link } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { SectionHeader } from "@/components/layout";
import {
  getAlbumImageFromData,
  handleImageError,
} from "@/lib/image-utils";
import type { Album } from "@/types/album";

interface GenresSectionProps {
  topGenres: [string, number][];
  randomizedGenreAlbums: Record<string, Album[]>;
  onRefresh?: () => void;
}

/**
 * Editorial genres block. Each card is a 2×2 mosaic of representative
 * sleeves with a mono kicker (genre name + count). No polaroid frames,
 * no rotations — just tidy paper.
 */
export function GenresSection({
  topGenres,
  randomizedGenreAlbums,
  onRefresh,
}: GenresSectionProps) {
  if (!topGenres.length) return null;

  return (
    <section className="space-y-5">
      <SectionHeader
        num="03"
        label="Genres"
        count={topGenres.length}
        action="Explore all"
        actionTo="/genres"
      />
      {onRefresh && (
        <div className="-mt-3 flex">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 border border-rule-strong bg-paper px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <Shuffle className="h-3 w-3" />
            Shuffle genres
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {topGenres.map(([genre, count]) => {
          const albums = randomizedGenreAlbums[genre] ?? [];
          const padded = padMosaic(albums);
          if (!padded.length) return null;
          return (
            <Link
              key={genre}
              to={`/albums/1?genre=${encodeURIComponent(genre)}`}
              className="group block border border-rule-strong bg-paper font-grot transition-colors hover:bg-paper-2"
            >
              <div className="grid aspect-square grid-cols-2 grid-rows-2 gap-[1px] bg-rule-strong">
                {padded.map((album, i) => (
                  <div
                    key={`${genre}-${i}`}
                    className="relative overflow-hidden bg-paper"
                  >
                    <img
                      src={getAlbumImageFromData(
                        album.uri_release,
                        "medium"
                      )}
                      alt=""
                      aria-hidden
                      onError={handleImageError}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-rule-strong px-4 py-3">
                <h3 className="truncate text-[15px] font-semibold tracking-[-0.005em] text-ink transition-colors group-hover:text-hl">
                  {genre}
                </h3>
                <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-dim">
                  {String(count).padStart(3, "0")} records
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Return exactly 4 albums for a 2×2 mosaic, repeating the seed if sparse. */
function padMosaic(albums: Album[]): Album[] {
  if (albums.length === 0) return [];
  if (albums.length >= 4) return albums.slice(0, 4);
  const seed = albums[0];
  return [...albums, ...Array(4 - albums.length).fill(seed)];
}
