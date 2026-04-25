import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { handleImageError } from "@/lib/image-utils";

interface Album {
  release_name: string;
  release_artist: string;
  genre_names: string[];
  date_added: string;
  date_release_year: string;
  uri_release: string;
  images_uri_release: { medium: string; avatar?: string };
}

interface Artist {
  name: string;
  uri: string;
  albums: Album[];
  albumCount: number;
  genres: string[];
  image: string;
  latestAlbum: string;
  biography?: string;
}

interface ArtistCardProps {
  artist: Artist;
  /** 1-based index; renders as a mono rank label beside the name. */
  index?: number;
  onClick?: () => void;
  className?: string;
}

/**
 * Editorial artist tile: square rounded photo,
 * ranked mono number, name, release count. Kept deliberately quiet so the
 * photo does the talking.
 */
export function ArtistCard({
  artist,
  index,
  onClick,
  className,
}: ArtistCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  const content = (
    <div className="group flex flex-col items-center text-center font-grot">
      <div className="relative aspect-square w-full overflow-hidden rounded-[6px] bg-paper-2">
        <img
          src={artist.image}
          alt={artist.name}
          width={360}
          height={360}
          loading="lazy"
          draggable={false}
          onError={handleImageError}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        {index != null && (
          <span className="font-mono text-[11px] tracking-[0.04em] text-ink-dim">
            {String(index).padStart(2, "0")}
          </span>
        )}
        <h3 className="line-clamp-1 font-display text-[18px] uppercase leading-none text-ink transition-colors group-hover:text-hl">
          {artist.name}
        </h3>
      </div>
      <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
        {artist.albumCount} {artist.albumCount === 1 ? "release" : "releases"}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={cn("cursor-pointer", className)}
      >
        {content}
      </div>
    );
  }

  return (
    <Link to={artist.uri} className={cn("block", className)}>
      {content}
    </Link>
  );
}
