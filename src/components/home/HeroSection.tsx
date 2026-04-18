import { useMemo } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { ColorPalette } from "@/lib/colorExtractor";
import { getCleanGenresFromArray } from "@/lib/genreUtils";
import {
  getAlbumImageFromData,
  getAlbumSlug,
  getArtistAvatarFromData,
  handleImageError,
} from "@/lib/image-utils";
import type { Album } from "@/types/album";
import { HeroChainTimeline } from "./HeroChainTimeline";

interface HeroSectionProps {
  currentFeatured: Album | null;
  featuredAlbums: Album[];
  featuredIndex: number;
  currentPalette: ColorPalette | null;
  autoRotateMs: number;
  onSelectIndex: (index: number) => void;
}

/**
 * Editorial asymmetric hero: the cover dominates the right half and the
 * display title overlaps its left edge. A full-width 6-segment timer
 * line at the bottom of the section acts as both progress indicator and
 * divider between the hero and the page body. Title font-size scales
 * across four tiers based on character count to prevent long names from
 * wrapping awkwardly.
 */
export function HeroSection({
  currentFeatured,
  featuredAlbums,
  featuredIndex,
  currentPalette,
  autoRotateMs,
  onSelectIndex,
}: HeroSectionProps) {
  const titleSizeClass = useMemo(() => {
    if (!currentFeatured) return "";
    const len = currentFeatured.release_name.length;
    if (len <= 10) return "text-[clamp(4.5rem,9vw,7.5rem)]";
    if (len <= 18) return "text-[clamp(3.75rem,7vw,6rem)]";
    if (len <= 28) return "text-[clamp(2.75rem,5.5vw,4.75rem)]";
    return "text-[clamp(2rem,4.25vw,3.5rem)]";
  }, [currentFeatured]);

  const timelineLabels = useMemo(
    () => featuredAlbums.map(a => a.release_name),
    [featuredAlbums],
  );

  if (!currentFeatured) return null;

  const year = new Date(currentFeatured.date_release_year).getFullYear();
  const genre =
    getCleanGenresFromArray(
      currentFeatured.genre_names,
      currentFeatured.release_artist,
    )[0] ?? "—";
  const added = formatAddedDate(currentFeatured.date_added);
  const heroImage = getAlbumImageFromData(currentFeatured.uri_release, "hi-res");
  const paletteClassName = `album-${getAlbumSlug(currentFeatured.uri_release)}`;
  const albumBg = "var(--album-bg, var(--album-bg-fallback))";
  const albumFg = "var(--album-fg, var(--album-fg-fallback))";
  const albumAccent = "var(--album-accent, var(--album-accent-fallback))";
  const albumMuted = "var(--album-muted, var(--album-muted-fallback))";

  const firstArtist =
    currentFeatured.artists?.[0]?.uri_artist ?? currentFeatured.uri_artist;

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden font-grot",
        paletteClassName,
      )}
      style={
        {
          "--album-bg-fallback": currentPalette?.background ?? "#8a8377",
          "--album-fg-fallback": currentPalette?.foreground ?? "#ffffff",
          "--album-accent-fallback": currentPalette?.accent ?? "#c03a2b",
          "--album-muted-fallback": currentPalette?.muted ?? "#5a534a",
        } as React.CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ backgroundColor: albumBg }}
      >
        <img
          src={heroImage}
          alt=""
          className="h-full w-full scale-[1.18] object-cover opacity-40 blur-2xl saturate-[1.2] md:blur-[72px]"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(
                110deg,
                color-mix(in oklab, ${albumBg} 92%, black 8%) 0%,
                color-mix(in oklab, ${albumBg} 80%, ${albumMuted} 20%) 50%,
                color-mix(in oklab, ${albumBg} 72%, ${albumAccent} 10%) 100%
              )
            `,
            mixBlendMode: "multiply",
          }}
        />
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background: `
              radial-gradient(
                circle at 78% 34%,
                color-mix(in oklab, ${albumAccent} 40%, transparent) 0%,
                transparent 42%
              ),
              radial-gradient(
                circle at 18% 86%,
                color-mix(in oklab, ${albumMuted} 48%, transparent) 0%,
                transparent 50%
              )
            `,
          }}
        />
      </div>

      {/* Desktop cover — bleeds to the section's right edge, outside the
          padded content container so it anchors to the viewport. */}
      <div
        className="pointer-events-none absolute right-0 top-1/2 hidden -translate-y-1/2 md:block"
        style={{
          width: "clamp(460px, 58vw, 720px)",
          aspectRatio: "1 / 1",
        }}
      >
        <div
          aria-hidden
          className="absolute -inset-[6%] opacity-85 blur-3xl"
          style={{
            background: `radial-gradient(circle at 50% 50%, color-mix(in oklab, ${albumAccent} 54%, transparent) 0%, transparent 65%)`,
          }}
        />
        <Link
          to={currentFeatured.uri_release}
          className="group pointer-events-auto relative block h-full w-full overflow-hidden border border-white/20 bg-paper/20 shadow-[0_38px_90px_-34px_rgba(14,13,11,0.58)]"
        >
          <img
            src={heroImage}
            alt={currentFeatured.release_name}
            onError={handleImageError}
            loading="eager"
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 ring-1 ring-inset ring-black/10 dark:ring-white/10" />
          <span
            className="absolute left-0 top-0 px-3 py-2 font-mono text-[10px] tracking-[0.08em] backdrop-blur-sm"
            style={{
              backgroundColor: `color-mix(in oklab, ${albumBg} 72%, transparent)`,
              color: albumFg,
            }}
          >
            CAT. {shortSlug(currentFeatured.uri_release)}
          </span>
        </Link>
      </div>

      <div className="relative mx-auto w-full max-w-[1640px] px-5 md:px-8">
        {/* Mobile: stacked cover + text */}
        <div className="flex flex-col gap-8 py-10 md:hidden">
          <Link
            to={currentFeatured.uri_release}
            className="group relative mx-auto block aspect-square w-full max-w-[520px] overflow-hidden border border-white/20 bg-paper/20 shadow-[0_38px_90px_-34px_rgba(14,13,11,0.58)]"
          >
            <img
              src={heroImage}
              alt={currentFeatured.release_name}
              onError={handleImageError}
              loading="eager"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 ring-1 ring-inset ring-black/10 dark:ring-white/10" />
            <span
              className="absolute left-0 top-0 px-3 py-2 font-mono text-[10px] tracking-[0.08em]"
              style={{
                backgroundColor: `color-mix(in oklab, var(--paper) 64%, ${albumBg} 36%)`,
                color: "var(--ink)",
              }}
            >
              CAT. {shortSlug(currentFeatured.uri_release)}
            </span>
          </Link>

          <div className="flex flex-col">
            <HeroHeading
              to={currentFeatured.uri_release}
              titleSizeClass={titleSizeClass}
              title={currentFeatured.release_name}
              fg={albumFg}
              bg={albumBg}
            />
            <HeroArtistLine
              to={firstArtist}
              artist={currentFeatured.release_artist}
              accentColor={albumAccent}
              fg={albumFg}
            />
            <HeroMeta
              year={year ? String(year) : "—"}
              genre={genre}
              added={added}
            />
            <HeroButtons
              albumHref={currentFeatured.uri_release}
              accent={albumAccent}
              accentFg={albumFg}
            />
          </div>
        </div>

        {/* Desktop: text column; cover sits outside the padded container. */}
        <div className="relative hidden md:block">
          <div className="relative min-h-[clamp(520px,60vh,720px)] py-14 md:py-20">
            {/* Text — flows naturally, overlaps cover's left edge */}
            <div
              className="relative z-10 flex h-full flex-col justify-center"
              style={{
                // Width reserves enough room for text to extend 6vw past
                // the cover's left edge (into the overlap zone).
                maxWidth:
                  "min(100%, calc(100% - clamp(460px, 58vw, 720px) + 8vw))",
                paddingRight: "clamp(0.5rem, 1vw, 1.5rem)",
              }}
            >
              <HeroHeading
                to={currentFeatured.uri_release}
                titleSizeClass={titleSizeClass}
                title={currentFeatured.release_name}
                fg={albumFg}
                bg={albumBg}
                overlap
              />
              <HeroArtistLine
                to={firstArtist}
                artist={currentFeatured.release_artist}
                accentColor={albumAccent}
                fg={albumFg}
              />
              <HeroMeta
                year={year ? String(year) : "—"}
                genre={genre}
                added={added}
              />
              <HeroButtons
                albumHref={currentFeatured.uri_release}
                accent={albumAccent}
                accentFg={albumFg}
              />
            </div>
          </div>
        </div>
      </div>

      <HeroChainTimeline
        total={featuredAlbums.length}
        activeIndex={featuredIndex}
        autoRotateMs={autoRotateMs}
        onSelect={onSelectIndex}
        labels={timelineLabels}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------

function HeroHeading({
  to,
  titleSizeClass,
  title,
  fg,
  bg,
  overlap = false,
}: {
  to: string;
  titleSizeClass: string;
  title: string;
  fg: string;
  bg: string;
  overlap?: boolean;
}) {
  return (
    <Link
      to={to}
      className="block font-bold leading-[0.9] tracking-[-0.045em] transition-opacity hover:opacity-85"
      style={{ color: fg }}
    >
      <h1
        className={cn("text-balance", titleSizeClass)}
        style={{
          maxWidth: "min(100%, 18ch)",
          ...(overlap
            ? {
                textShadow: `0 1px 0 color-mix(in oklab, ${bg} 70%, transparent), 0 0 22px color-mix(in oklab, ${bg} 55%, transparent)`,
              }
            : {}),
        }}
      >
        {title}
      </h1>
    </Link>
  );
}

function HeroArtistLine({
  to,
  artist,
  accentColor,
  fg,
}: {
  to: string;
  artist: string;
  accentColor: string;
  fg: string;
}) {
  const avatar = getArtistAvatarFromData(to);
  return (
    <Link
      to={to}
      className="mt-4 inline-flex w-fit items-center gap-3 transition-opacity hover:opacity-85"
      style={{ color: `color-mix(in oklab, ${fg} 82%, transparent)` }}
    >
      <span
        className="relative block h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2"
        style={{
          // Ring uses the accent so the avatar echoes the palette bar it replaces.
          boxShadow: `0 0 0 2px ${accentColor}`,
          backgroundColor: `color-mix(in oklab, ${fg} 10%, transparent)`,
        }}
        aria-hidden
      >
        <img
          src={avatar}
          alt=""
          onError={handleImageError}
          loading="eager"
          className="h-full w-full object-cover"
        />
      </span>
      <span className="text-[clamp(18px,2vw,24px)] font-semibold tracking-[-0.015em]">
        {artist}
      </span>
    </Link>
  );
}

function HeroMeta({
  year,
  genre,
  added,
}: {
  year: string;
  genre: string;
  added: string;
}) {
  return (
    <dl className="mt-7 grid max-w-[34rem] grid-cols-2 gap-2.5 md:grid-cols-3">
      <KV label="Year" value={year} />
      <KV label="Genre" value={genre} mono />
      <KV label="Added" value={added} mono />
    </dl>
  );
}

function HeroButtons({
  albumHref,
  accent,
  accentFg,
}: {
  albumHref: string;
  accent: string;
  accentFg: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap gap-2">
      <Link
        to={albumHref}
        className="inline-flex h-10 items-center gap-2 border px-4 text-[12.5px] font-medium tracking-[-0.005em] transition-all hover:-translate-y-px hover:brightness-110"
        style={{
          backgroundColor: accent,
          borderColor: accent,
          color: accentFg,
          boxShadow: `0 18px 32px -22px ${accent}`,
        }}
      >
        Open record <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function KV({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative border-y border-l px-3 py-3 pl-4 backdrop-blur-[2px] md:px-4 md:pl-5",
        className,
      )}
      style={{
        backgroundColor:
          "color-mix(in oklab, var(--album-fg, var(--album-fg-fallback)) 6%, transparent)",
        borderColor:
          "color-mix(in oklab, var(--album-fg, var(--album-fg-fallback)) 22%, transparent)",
        color: "var(--album-fg, var(--album-fg-fallback))",
      }}
    >
      {/* Accent rail on the left edge — catalogue-card marker */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{
          backgroundColor:
            "var(--album-accent, var(--album-accent-fallback))",
        }}
      />
      <dt
        className="font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{
          color:
            "color-mix(in oklab, var(--album-fg, var(--album-fg-fallback)) 62%, transparent)",
        }}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1.5 truncate text-[15px] font-semibold leading-tight md:text-[16px]",
          mono &&
            "font-mono text-[13px] uppercase tracking-[0.02em] md:text-[14px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

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

function shortSlug(uri: string): string {
  const slug = uri.replace("/album/", "").replace(/\/$/, "");
  const tail = slug.split("-").slice(-1)[0];
  if (tail && /\d/.test(tail)) return tail.slice(-4).toUpperCase();
  return slug.slice(0, 4).toUpperCase();
}
