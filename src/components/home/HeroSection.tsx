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
        <div className="flex min-w-0 flex-col items-start">
          <h1
            className="text-display uppercase text-ink"
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

          <p className="mt-4 max-w-[43ch] font-mono text-[13px] leading-[1.55] text-ink-2">
            {genres.length
              ? `${genres.join(" / ")} from ${year || "the archive"}. A current shelf marker from the personal record collection.`
              : "A current shelf marker from the personal record collection."}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              to={albumHref}
              className="inline-flex items-center gap-3 border border-ink bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-paper transition-[color,background-color,border-color,transform] duration-200 hover:border-hl hover:bg-hl active:translate-y-px"
            >
              View Record
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="min-w-0">
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

          <div className="mt-5 flex justify-center gap-8 font-mono text-[13px] tracking-[0.08em] text-ink-dim">
            {featuredAlbums.slice(0, 7).map((album, index) => {
              const active = index === featuredIndex;
              return (
                <button
                  key={album.uri_release}
                  type="button"
                  aria-label={`Show featured record ${index + 1}: ${album.release_name}`}
                  aria-pressed={active}
                  onClick={() => onSelectIndex(index)}
                  className={cn(
                    "border-b py-1 transition-[color,border-color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink",
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

        <aside className="grid gap-0 border-y border-rule-strong lg:border-y-0">
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
          <div className="hidden border-b border-rule py-8 lg:block">
            <span className="block h-10 w-20 text-ink" aria-hidden>
              <svg viewBox="0 0 96 48" fill="none">
                <path
                  d="M2 24h12l5-15 9 30 7-23 7 16 7-8h45"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.32"
                />
                <path
                  className="waveform-trace"
                  d="M2 24h12l5-15 9 30 7-23 7 16 7-8h45"
                  stroke={accent}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength="1"
                  strokeDasharray="0.34 1"
                />
              </svg>
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}

function MetaRail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-rule py-4 last:border-b-0 lg:py-5">
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
    maxWidth,
    lineHeight: 0.9,
  };
}
