import { Link } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { SectionHeader } from "@/components/layout";
import { appConfig } from "@/config/app.config";
import { handleImageError } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import type { Artist } from "@/types/album";

interface RandomArtistsSectionProps {
  randomArtists: Artist[];
  onRefresh?: () => void;
}

/**
 * Editorial random-artist grid. Round photos, mono rank, grot name.
 */
export function RandomArtistsSection({
  randomArtists,
  onRefresh,
}: RandomArtistsSectionProps) {
  if (randomArtists.length === 0) return null;

  const list = randomArtists.slice(
    0,
    appConfig.homepage.randomArtists.displayCount
  );

  return (
    <section className="space-y-5">
      <SectionHeader
        num="05"
        label="Random Roster"
        count={list.length}
        action="All artists"
        actionTo="/artists/1"
      />
      {onRefresh && (
        <div className="-mt-3 flex">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 border border-rule-strong bg-paper px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <Shuffle className="h-3 w-3" />
            Shuffle roster
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {list.map((artist, i) => (
          <Link
            key={artist.name}
            to={artist.uri}
            className={cn(
              "group block text-center font-grot",
              i >= 4 && "hidden sm:block",
            )}
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-full bg-paper-2">
              <img
                src={artist.avatar}
                alt={artist.name}
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
              <h3 className="line-clamp-1 text-[14px] font-semibold leading-tight tracking-[-0.005em] text-ink transition-colors group-hover:text-hl">
                {artist.name}
              </h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
