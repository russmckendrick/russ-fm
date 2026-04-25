import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { ColorPalette } from "@/lib/colorExtractor";
import {
  getAlbumImageFromData,
  getAlbumSlug,
  handleImageError,
} from "@/lib/image-utils";
import { getCleanGenresFromArray } from "@/lib/genreUtils";
import type { Album } from "@/types/album";

interface HeroSectionProps {
  currentFeatured: Album | null;
  featuredAlbums: Album[];
  featuredIndex: number;
  currentPalette: ColorPalette | null;
  autoRotateMs: number;
  timelineKey: number;
  onSelectIndex: (index: number) => void;
}

/**
 * Screenshot-led home hero: paper surface, giant condensed title, central
 * sleeve, right-side metadata rail, and a small numbered selector. State is
 * still managed by HomePage so auto-rotation remains unchanged.
 */
export function HeroSection({
  currentFeatured,
  featuredAlbums,
  featuredIndex,
  currentPalette,
  autoRotateMs,
  timelineKey,
  onSelectIndex,
}: HeroSectionProps) {
  if (!currentFeatured) return null;

  const albumHref = currentFeatured.uri_release;
  const firstArtist =
    currentFeatured.artists?.[0]?.uri_artist ?? currentFeatured.uri_artist;
  const cover = getAlbumImageFromData(currentFeatured.uri_release, "hi-res");
  const year = getYear(currentFeatured.date_release_year);
  const added = formatAdded(currentFeatured.date_added);
  const genres = getCleanGenresFromArray(
    currentFeatured.genre_names,
    currentFeatured.release_artist,
  ).slice(0, 2);
  const tint = currentPalette?.background ?? "var(--paper-2)";
  const accent = currentPalette?.accent ?? "var(--hl)";
  const paletteClassName = `album-${getAlbumSlug(currentFeatured.uri_release)}`;
  const titleStyle = getTitleStyle(currentFeatured.release_name);
  const heroDescription = getHeroDescription(genres, year);

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden border-b border-rule bg-paper font-grot lg:h-[720px] xl:h-[760px]",
        paletteClassName,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          background: `radial-gradient(circle at 62% 22%, ${tint} 0%, transparent 34%)`,
        }}
      />

      <div className="relative mx-auto grid h-full w-full max-w-[1640px] gap-9 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)_220px] lg:items-center lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)_260px]">
        <div className="order-2 flex min-w-0 flex-col items-start lg:order-none">
          <h1
            className="text-display max-w-full uppercase text-ink lg:max-w-[var(--hero-title-max-width)]"
            style={titleStyle}
          >
            {currentFeatured.release_name}
          </h1>

          <Link
            to={firstArtist}
            className="mt-5 font-display text-[22px] uppercase leading-none text-ink transition-colors hover:text-hl"
          >
            {currentFeatured.release_artist}
          </Link>

          {heroDescription && (
            <p className="mt-4 max-w-[43ch] font-mono text-[13px] leading-[1.55] text-ink-2">
              {heroDescription}
            </p>
          )}

          <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              to={albumHref}
              className="inline-flex w-full items-center justify-center gap-3 border border-ink bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-paper transition-[color,background-color,border-color,transform] duration-200 hover:border-hl hover:bg-hl active:translate-y-px sm:w-auto"
            >
              View Record
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="order-1 min-w-0 lg:order-none">
          <Link
            to={albumHref}
            className="group mx-auto block w-full max-w-[580px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            <div
              className="aspect-square overflow-hidden bg-paper-2 shadow-[0_28px_70px_-36px_rgba(14,13,11,0.45)]"
              style={{
                boxShadow: `0 38px 90px -48px ${accent}, 0 18px 48px -34px rgba(14,13,11,0.42)`,
              }}
            >
              <img
                src={cover}
                alt={currentFeatured.release_name}
                width={720}
                height={720}
                fetchPriority="high"
                onError={handleImageError}
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
              />
            </div>
          </Link>

          <div
            className="mt-5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Featured records"
          >
            <div className="mx-auto flex w-max min-w-full justify-center gap-5 font-mono text-[13px] tracking-[0.08em] text-ink-dim sm:gap-7">
              {featuredAlbums.map((album, index) => {
                const active = index === featuredIndex;
                return (
                  <button
                    key={album.uri_release}
                    type="button"
                    aria-label={`Show featured record ${index + 1}: ${album.release_name}`}
                    aria-pressed={active}
                    onClick={() => onSelectIndex(index)}
                    className={cn(
                      "shrink-0 border-b py-1 transition-[color,border-color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink",
                      active
                        ? "border-ink text-ink"
                        : "border-transparent hover:border-rule-strong hover:text-ink",
                    )}
                    style={
                      active
                        ? {
                            animationDuration: `${autoRotateMs}ms`,
                            borderColor: accent,
                            color: accent,
                          }
                        : undefined
                    }
                  >
                    {String(index + 1).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="order-3 grid grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong sm:grid-cols-3 lg:order-none lg:grid-cols-1 lg:gap-0 lg:border-0 lg:bg-transparent">
          <MetaRail label="Released" value={year || "—"} />
          <MetaRail
            label="Format"
            value="Record"
          />
          <MetaRail label="Added" value={added} />
          <MetaRail
            label="Genres"
            value={genres.length ? genres.join(", ") : "Collection"}
          />
          <HeroCountdownWaveform
            accent={accent}
            autoRotateMs={autoRotateMs}
            timelineKey={timelineKey}
          />
        </aside>
      </div>
    </section>
  );
}

function HeroCountdownWaveform({
  accent,
  autoRotateMs,
  timelineKey,
}: {
  accent: string;
  autoRotateMs: number;
  timelineKey: number;
}) {
  const duration = `${Math.max(autoRotateMs, 1)}ms`;
  const path = "M4 24h30l9-18 16 36 13-27 13 17 13-10 16 18 15-29 14 21 14-8h79";
  const clipId = `hero-countdown-${timelineKey}`;

  return (
    <div className="hidden border-b border-rule py-8 lg:block">
      <svg
        viewBox="0 0 240 48"
        fill="none"
        className="block h-12 w-full text-ink"
        aria-hidden
      >
        <path
          d={path}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.24"
        />
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect
              key={timelineKey}
              className="hero-countdown-window"
              x="0"
              y="0"
              width="240"
              height="48"
              style={{ animationDuration: duration }}
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <path
            d={path}
            stroke={accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}

function MetaRail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper p-4 lg:border-b lg:border-rule lg:bg-transparent lg:px-0 lg:py-5 lg:last:border-b-0">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </div>
      <div className="mt-2 break-words font-display text-[19px] uppercase leading-tight text-ink">
        {value}
      </div>
    </div>
  );
}

function getYear(date: string | undefined): string {
  if (!date) return "";
  const year = new Date(date).getFullYear();
  return Number.isFinite(year) ? String(year) : "";
}

function formatAdded(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

function getHeroDescription(genres: string[], year: string): string {
  if (genres.length && year) return `${genres.join(" / ")} from ${year}.`;
  if (genres.length) return `${genres.join(" / ")}.`;
  if (year) return `Released ${year}.`;
  return "";
}

function getTitleStyle(title: string): CSSProperties {
  const words = title.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
  const charCount = title.length;

  let maxPx = 128;
  let preferredVw = 9.2;
  let maxWidth = "min(100%, 9.6ch)";

  if (longestWord >= 18 || charCount >= 46) {
    maxPx = 72;
    preferredVw = 4.9;
    maxWidth = "min(100%, 13.8ch)";
  } else if (longestWord >= 13 || charCount >= 34) {
    maxPx = 88;
    preferredVw = 5.8;
    maxWidth = "min(100%, 12.4ch)";
  } else if (longestWord >= 11 || charCount >= 24) {
    maxPx = 104;
    preferredVw = 7.1;
    maxWidth = "min(100%, 11.2ch)";
  }

  return {
    fontSize: `clamp(48px, ${preferredVw}vw, ${maxPx}px)`,
    "--hero-title-max-width": maxWidth,
    lineHeight: 0.9,
  } as CSSProperties;
}
