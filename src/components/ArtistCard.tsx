import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { AlbumColorPalette } from "@/hooks/useAlbumColors";
import { Vinyl } from "@/components/player/Vinyl";
import { circleCrop, useArtistImageInfo } from "@/lib/artistImage";
import { getAlbumImageFromData, getArtistImageFromData, handleImageError } from "@/lib/image-utils";
import { floodFor } from "@/lib/sleeveColour";
import { cn } from "@/lib/utils";
import { discLook } from "@/lib/vinylLook";
import type { Album } from "@/types/album";

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
  /** A bigger tile (the caller spans it over two columns and rows): larger name and ring. */
  feature?: boolean;
  /**
   * The artist's latest record. Its disc sits behind the photo and slides out
   * sideways on hover, the sleeve on its label, in the pressing's colour.
   */
  record?: Pick<Album, "uri_release" | "vinyl_colours"> | null;
  onClick?: () => void;
  className?: string;
}

/**
 * Artist in a grid: round photo with a ring in the colour of their latest
 * sleeve, name in bold display type and the record count in mono. With a
 * `record`, that record's disc is tucked behind the photo and slides out on
 * hover, as on the album tiles.
 */
export function ArtistCard({ artist, palette, feature = false, record, onClick, className }: ArtistCardProps) {
  const colours = floodFor(palette);
  const count = artist.albumCount;
  // The disc is hidden until hover, so its label sleeve and coloured
  // pressing load then: a page of cards never fetches what it has not shown.
  const [peeked, setPeeked] = useState(false);
  const peek = record ? () => setPeeked(true) : undefined;

  const content = (
    <div className="flex min-w-0 flex-col items-center text-center" style={{ "--accent": colours.flood } as CSSProperties}>
      <div className={cn("relative aspect-square w-full", record && "artist-rec")}>
        {record && (
          <Vinyl
            label={colours.ground}
            cover={peeked ? getAlbumImageFromData(record.uri_release, "medium") : null}
            look={peeked ? discLook(record.vinyl_colours, 0) : null}
            spin={false}
          />
        )}
        <ArtistPhoto
          uri={artist.uri}
          image={artist.image}
          size={feature ? 720 : 360}
          className={cn(
            "artist-rec-photo h-full w-full",
            "transition-[box-shadow,transform] duration-300 ease-out motion-reduce:transition-none",
            feature
              ? "shadow-[0_0_0_4px_var(--ground),0_0_0_10px_var(--accent)] group-hover:shadow-[0_0_0_4px_var(--ground),0_0_0_16px_var(--accent)] group-focus-visible:shadow-[0_0_0_4px_var(--ground),0_0_0_16px_var(--accent)]"
              : "shadow-[0_0_0_3px_var(--ground),0_0_0_6px_var(--accent)] group-hover:shadow-[0_0_0_3px_var(--ground),0_0_0_10px_var(--accent)] group-focus-visible:shadow-[0_0_0_3px_var(--ground),0_0_0_10px_var(--accent)]",
          )}
        />
      </div>

      <h3
        className={cn(
          "t-dispn line-clamp-2 w-full break-words leading-[1.1]",
          feature ? "mt-7 text-[22px] md:text-[28px] lg:text-[32px]" : "mt-5 text-[16px] md:text-[18px]",
        )}
      >
        {artist.name}
      </h3>
      {count > 0 && (
        <span className={cn("t-mono mt-2 uppercase text-[color:var(--cream-dim)]", feature ? "text-[13px]" : "text-[11px]")}>
          {count.toLocaleString("en-GB")} {count === 1 ? "record" : "records"}
        </span>
      )}
    </div>
  );

  const classes = cn(
    "group relative block min-w-0 rounded-2xl p-2 text-[color:var(--cream)] outline-none hover:z-10 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[color:var(--cream)]",
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} onPointerEnter={peek} onFocus={peek} aria-label={artist.name} className={cn(classes, "w-full")}>
        {content}
      </button>
    );
  }

  return (
    <Link
      to={artist.uri}
      onPointerEnter={peek}
      onFocus={peek}
      aria-label={count > 0 ? `${artist.name}, ${count} ${count === 1 ? "record" : "records"}` : artist.name}
      className={classes}
    >
      {content}
    </Link>
  );
}

interface ArtistPhotoProps {
  /** The artist's `/artist/<slug>/` path, for the photo's -image.json notes. */
  uri: string;
  /** Photo URL, built by the caller with the image-utils helpers. */
  image: string;
  /** Intrinsic size hint for the <img>. */
  size?: number;
  /** Size, ring and the like; the photo is always round. */
  className?: string;
}

/**
 * A round artist photo framed round the faces from its -image.json notes
 * (circleCrop), pushing in on them when the surrounding `group` is hovered.
 * It fades in once those notes have loaded, so it never jumps from a centre
 * crop.
 */
export function ArtistPhoto({ uri, image, size = 360, className }: ArtistPhotoProps) {
  const info = useArtistImageInfo(uri);
  const crop = info ? circleCrop(info) : null;
  const ready = info !== undefined;
  const src = crop?.full ? getArtistImageFromData(uri, "hi-res") : image;

  return (
    <div className={cn("relative overflow-hidden rounded-full bg-[var(--ground-3)]", className)}>
      <img
        src={ready ? src : undefined}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={handleImageError}
        className={cn(
          "max-w-none transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
          crop?.faces ? "group-hover:scale-[1.18] group-focus-visible:scale-[1.18]" : "group-hover:scale-[1.05]",
          crop ? "absolute" : "h-full w-full object-cover",
          ready ? "opacity-100" : "opacity-0",
        )}
        style={
          crop
            ? {
                width: `${crop.width}%`,
                height: `${crop.height}%`,
                left: `${crop.left}%`,
                top: `${crop.top}%`,
                transformOrigin: `${crop.originX}% ${crop.originY}%`,
              }
            : undefined
        }
      />
    </div>
  );
}
