import { Link } from "react-router-dom";
import { DragWall, SectionHeader } from "@/components/layout";
import { redesignConfig } from "@/config/redesign.config";
import { handleImageError } from "@/lib/image-utils";
import type { Artist } from "@/types/album";

interface RecentArtistsSectionProps {
  recentArtists: Artist[];
}

/**
 * Editorial "recently added · artists" drag-scroll wall. Square photos,
 * mono rank, grot name, mono subline ("Latest: …").
 */
export function RecentArtistsSection({
  recentArtists,
}: RecentArtistsSectionProps) {
  if (!recentArtists.length) return null;
  const count = redesignConfig.walls.recentArtistsCount;
  const list = recentArtists.slice(0, count);

  return (
    <section className="space-y-5">
      <SectionHeader
        num="02"
        label="Recently Added · Artists"
        count={list.length}
        action="View all"
        actionTo="/artists/1"
      />
      <DragWall ariaLabel="Recently added artists" itemBasis="min(42vw, 220px)">
        {list.map((artist, i) => (
          <Link
            key={artist.name}
            to={artist.uri}
            className="group block text-center font-grot"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-[6px] bg-paper-2">
              <img
                src={artist.avatar}
                alt={artist.name}
                width={360}
                height={360}
                loading="lazy"
                draggable={false}
                onError={handleImageError}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
            </div>
            <div className="mt-3 flex items-baseline justify-center gap-2">
              <span className="font-mono text-[11px] tracking-[0.04em] text-ink-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="line-clamp-1 text-[15px] font-semibold leading-tight tracking-[-0.005em] text-ink transition-colors group-hover:text-hl">
                {artist.name}
              </h3>
            </div>
            <div className="mt-1 line-clamp-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
              Latest · {artist.latestAlbum.release_name}
            </div>
          </Link>
        ))}
      </DragWall>
    </section>
  );
}
