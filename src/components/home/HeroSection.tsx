import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { ColorPalette } from "@/lib/colorExtractor";
import {
  getAlbumImageFromData,
  getAlbumSlug,
  handleImageError,
} from "@/lib/image-utils";
import type { Album } from "@/types/album";

interface HeroSectionProps {
  currentFeatured: Album | null;
  featuredAlbums: Album[];
  featuredIndex: number;
  currentPalette: ColorPalette | null;
  autoRotateMs: number;
  onSelectIndex: (index: number) => void;
}

interface HeroBackdrop {
  image: string;
  background: string;
  foreground: string;
  accent: string;
  muted: string;
}

/**
 * Poster-led home hero. The latest ten featured records become a
 * horizontally scrollable coverflow: the active sleeve anchors the
 * composition, neighboring sleeves recede, and the supporting copy is
 * reduced to a slim caption + action row.
 */
export function HeroSection({
  currentFeatured,
  featuredAlbums,
  featuredIndex,
  currentPalette,
  autoRotateMs,
  onSelectIndex,
}: HeroSectionProps) {
  const [isDesktopCoverflow, setIsDesktopCoverflow] = useState(false);
  const [previousBackdrop, setPreviousBackdrop] = useState<HeroBackdrop | null>(null);
  const [isBackdropCrossfading, setIsBackdropCrossfading] = useState(false);
  const lastBackdropRef = useRef<HeroBackdrop | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktopCoverflow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const heroBackdrop = useMemo<HeroBackdrop | null>(() => {
    if (!currentFeatured) return null;
    return {
      image: getAlbumImageFromData(currentFeatured.uri_release, "hi-res"),
      background: currentPalette?.background ?? "#8a8377",
      foreground: currentPalette?.foreground ?? "#ffffff",
      accent: currentPalette?.accent ?? "#c03a2b",
      muted: currentPalette?.muted ?? "#5a534a",
    };
  }, [
    currentFeatured?.uri_release,
    currentPalette?.accent,
    currentPalette?.background,
    currentPalette?.foreground,
    currentPalette?.muted,
  ]);

  useEffect(() => {
    if (!heroBackdrop) return undefined;

    const previous = lastBackdropRef.current;
    const changed =
      previous &&
      (previous.image !== heroBackdrop.image ||
        previous.background !== heroBackdrop.background ||
        previous.foreground !== heroBackdrop.foreground ||
        previous.accent !== heroBackdrop.accent ||
        previous.muted !== heroBackdrop.muted);

    if (changed) {
      setPreviousBackdrop(previous);
      setIsBackdropCrossfading(true);
      const fadeFrame = window.requestAnimationFrame(() => {
        setIsBackdropCrossfading(false);
      });
      const timer = window.setTimeout(() => {
        setPreviousBackdrop(null);
      }, 720);
      lastBackdropRef.current = heroBackdrop;
      return () => {
        window.cancelAnimationFrame(fadeFrame);
        window.clearTimeout(timer);
      };
    }

    lastBackdropRef.current = heroBackdrop;
    return undefined;
  }, [heroBackdrop]);

  if (!currentFeatured || !heroBackdrop) return null;

  const paletteClassName = `album-${getAlbumSlug(currentFeatured.uri_release)}`;
  const firstArtist =
    currentFeatured.artists?.[0]?.uri_artist ?? currentFeatured.uri_artist;
  const albumFg = "var(--album-fg, var(--album-fg-fallback))";

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden border-b border-rule font-grot",
        paletteClassName,
      )}
      style={
        {
          "--album-bg-fallback": heroBackdrop.background,
          "--album-fg-fallback": heroBackdrop.foreground,
          "--album-accent-fallback": heroBackdrop.accent,
          "--album-muted-fallback": heroBackdrop.muted,
        } as React.CSSProperties
      }
    >
      <HeroBackdropLayer backdrop={heroBackdrop} opacityClassName="opacity-100" />
      {previousBackdrop ? (
        <HeroBackdropLayer
          backdrop={previousBackdrop}
          opacityClassName={
            isBackdropCrossfading
              ? "opacity-100 transition-opacity duration-700 ease-out"
              : "opacity-0 transition-opacity duration-700 ease-out"
          }
        />
      ) : null}

      <div className="relative mx-auto w-full max-w-[1640px] px-5 pb-8 pt-8 md:px-8 md:pb-10 md:pt-10">
        <HeroCoverflow
          featuredAlbums={featuredAlbums}
          activeIndex={featuredIndex}
          onSelect={onSelectIndex}
          isDesktopCoverflow={isDesktopCoverflow}
          autoRotateMs={autoRotateMs}
        />

        <div className="mt-4 flex flex-col items-center gap-2.5 text-center md:mt-6">
          <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
            <Link
              to={currentFeatured.uri_release}
              className="text-[14px] font-semibold tracking-[0.01em] transition-opacity hover:opacity-75 md:text-[16px]"
              style={{ color: albumFg }}
            >
              {currentFeatured.release_name}
            </Link>
            <span
              aria-hidden
              className="font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{ color: `color-mix(in oklab, ${albumFg} 48%, transparent)` }}
            >
              /
            </span>
            <Link
              to={firstArtist}
              className="text-[14px] font-medium tracking-[0.01em] transition-opacity hover:opacity-75 md:text-[16px]"
              style={{
                color: `color-mix(in oklab, ${albumFg} 82%, transparent)`,
              }}
            >
              {currentFeatured.release_artist}
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link
              to={currentFeatured.uri_release}
              className="inline-flex items-center gap-2 text-[13px] font-medium tracking-[0.01em] transition-opacity hover:opacity-75"
              style={{ color: albumFg }}
            >
              Open record <span aria-hidden>→</span>
            </Link>
            <Link
              to={firstArtist}
              className="inline-flex items-center gap-2 text-[13px] font-medium tracking-[0.01em] transition-opacity hover:opacity-75"
              style={{
                color: `color-mix(in oklab, ${albumFg} 86%, transparent)`,
              }}
            >
              View artist <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function HeroBackdropLayer({
  backdrop,
  opacityClassName,
}: {
  backdrop: HeroBackdrop;
  opacityClassName: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden will-change-[opacity]",
        opacityClassName,
      )}
      style={{ backgroundColor: backdrop.background }}
    >
      <img
        src={backdrop.image}
        alt=""
        className="absolute inset-0 h-full w-full scale-[1.12] object-cover object-center opacity-[0.46] blur-[54px] saturate-[1.04] md:scale-[1.28] md:opacity-[0.56] md:blur-[108px]"
      />
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(
              circle at 50% 42%,
              color-mix(in oklab, ${backdrop.accent} 16%, transparent) 0%,
              transparent 42%
            ),
            radial-gradient(
              circle at 50% 70%,
              color-mix(in oklab, ${backdrop.muted} 26%, transparent) 0%,
              transparent 56%
            ),
            linear-gradient(
              180deg,
              color-mix(in oklab, ${backdrop.background} 58%, black 18%) 0%,
              color-mix(in oklab, ${backdrop.background} 16%, transparent) 24%,
              color-mix(in oklab, ${backdrop.background} 12%, transparent) 76%,
              color-mix(in oklab, ${backdrop.background} 62%, black 22%) 100%
            )
          `,
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: `
            linear-gradient(
              90deg,
              color-mix(in oklab, ${backdrop.background} 24%, transparent) 0%,
              transparent 22%,
              transparent 78%,
              color-mix(in oklab, ${backdrop.background} 24%, transparent) 100%
            )
          `,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface HeroCoverflowProps {
  featuredAlbums: Album[];
  activeIndex: number;
  onSelect: (index: number) => void;
  isDesktopCoverflow: boolean;
  autoRotateMs: number;
}

function HeroCoverflow({
  featuredAlbums,
  activeIndex,
  onSelect,
  isDesktopCoverflow,
  autoRotateMs,
}: HeroCoverflowProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const drag = useRef({ down: false, x: 0, sl: 0, moved: 0 });
  const didInitialCenter = useRef(false);
  const syncingRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopCopies = 5;

  const loopedAlbums = useMemo(
    () =>
      Array.from({ length: loopCopies }, (_, copyIndex) =>
        featuredAlbums.map((album, realIndex) => ({
          album,
          realIndex,
          loopIndex: copyIndex * featuredAlbums.length + realIndex,
        })),
      ).flat(),
    [featuredAlbums],
  );

  const getCenteredLoopIndex = useCallback(
    (realIndex: number) =>
      Math.floor(loopCopies / 2) * featuredAlbums.length + realIndex,
    [featuredAlbums.length],
  );

  const nearestLoopIndex = useCallback(() => {
    const track = trackRef.current;
    if (!track) return activeIndex;

    const center = track.scrollLeft + track.clientWidth / 2;
    let nearest = getCenteredLoopIndex(activeIndex);
    let nearestDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, index) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - center);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });

    return nearest;
  }, [activeIndex, getCenteredLoopIndex]);

  const centerLoopIndex = useCallback(
    (loopIndex: number, behavior: ScrollBehavior) => {
      const track = trackRef.current;
      const card = cardRefs.current[loopIndex];
      if (!track || !card) return;

      const target =
        card.offsetLeft + card.offsetWidth / 2 - track.clientWidth / 2;
      const left = Math.max(0, Math.min(target, track.scrollWidth - track.clientWidth));

      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncingRef.current = behavior === "smooth";
      track.scrollTo({ left, behavior });

      if (behavior === "smooth") {
        syncTimerRef.current = setTimeout(() => {
          syncingRef.current = false;
        }, Math.min(autoRotateMs / 3, 520));
      } else {
        syncingRef.current = false;
      }
    },
    [autoRotateMs],
  );

  const centerActive = useCallback(
    (realIndex: number, behavior: ScrollBehavior) => {
      centerLoopIndex(getCenteredLoopIndex(realIndex), behavior);
    },
    [centerLoopIndex, getCenteredLoopIndex],
  );

  useLayoutEffect(() => {
    const behavior: ScrollBehavior = didInitialCenter.current ? "smooth" : "auto";
    didInitialCenter.current = true;
    centerActive(activeIndex, behavior);
  }, [activeIndex, centerActive]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      track.scrollLeft += event.deltaY;
      event.preventDefault();
    };

    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onScroll = () => {
      if (syncingRef.current) return;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        const nextLoopIndex = nearestLoopIndex();
        const next = loopedAlbums[nextLoopIndex];
        if (!next) return;

        if (next.realIndex !== activeIndex) onSelect(next.realIndex);
        else centerLoopIndex(getCenteredLoopIndex(next.realIndex), "smooth");
      }, 110);
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [
    activeIndex,
    centerLoopIndex,
    getCenteredLoopIndex,
    loopedAlbums,
    nearestLoopIndex,
    onSelect,
  ]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;

    drag.current = {
      down: true,
      x: event.clientX,
      sl: track.scrollLeft,
      moved: 0,
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (!drag.current.down || !trackRef.current) return;
      const dx = moveEvent.clientX - drag.current.x;
      drag.current.moved = Math.abs(dx);
      if (drag.current.moved > 3) {
        trackRef.current.classList.add("cursor-grabbing");
        moveEvent.preventDefault();
      }
      trackRef.current.scrollLeft = drag.current.sl - dx;
    };

    const onUp = () => {
      drag.current.down = false;
      if (trackRef.current) trackRef.current.classList.remove("cursor-grabbing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      if (drag.current.moved > 6) {
        const stopClick = (clickEvent: Event) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
          window.removeEventListener("click", stopClick, true);
        };
        window.addEventListener("click", stopClick, true);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const trackStyle: React.CSSProperties = {
    paddingLeft: isDesktopCoverflow ? "max(16vw, 4rem)" : "1.25rem",
    paddingRight: isDesktopCoverflow ? "max(16vw, 4rem)" : "1.25rem",
    perspective: isDesktopCoverflow ? "2200px" : undefined,
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        role="region"
        aria-label="Featured releases coverflow"
        className={cn(
          "flex items-end gap-3 overflow-x-auto overflow-y-visible px-5 py-4",
          "cursor-grab select-none scroll-smooth",
          "snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          "md:gap-4 md:py-8 lg:py-12",
        )}
        style={trackStyle}
        onPointerDown={onPointerDown}
      >
        {loopedAlbums.map(({ album, realIndex, loopIndex }) => {
          const image = getAlbumImageFromData(album.uri_release, "hi-res");
          const isActive = loopIndex === getCenteredLoopIndex(activeIndex);
          const position = String(realIndex + 1).padStart(2, "0");
          const coverflowOffset = loopIndex - getCenteredLoopIndex(activeIndex);

          return (
            <button
              key={`${album.uri_release}-${loopIndex}`}
              ref={node => {
                cardRefs.current[loopIndex] = node;
              }}
              type="button"
              aria-label={`Show featured release ${realIndex + 1} of ${featuredAlbums.length}: ${album.release_name} by ${album.release_artist}`}
              aria-pressed={isActive}
              title={`${position} · ${album.release_name}`}
              onClick={() => onSelect(realIndex)}
              onKeyDown={event => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const delta = event.key === "ArrowLeft" ? -1 : 1;
                const next = (realIndex + delta + featuredAlbums.length) % featuredAlbums.length;
                onSelect(next);
                requestAnimationFrame(() => {
                  cardRefs.current[getCenteredLoopIndex(next)]?.focus();
                });
              }}
              className="group relative shrink-0 snap-center bg-transparent p-0 text-left focus-visible:outline-none"
              style={{
                width: isDesktopCoverflow ? "clamp(220px, 20vw, 320px)" : "min(70vw, 390px)",
                ...getCoverflowCardStyle(coverflowOffset, isDesktopCoverflow),
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-[12%] bottom-[-2%] top-[76%] rounded-full blur-2xl"
                style={{
                  backgroundColor: isActive
                    ? "color-mix(in oklab, var(--album-accent, var(--album-accent-fallback)) 46%, transparent)"
                    : "color-mix(in oklab, var(--album-bg, var(--album-bg-fallback)) 28%, transparent)",
                  opacity: isActive ? 0.72 : 0.2,
                }}
              />

              <div
                className={cn(
                  "relative aspect-square overflow-hidden border transition-[border-color,box-shadow] duration-500",
                  isActive
                    ? "shadow-[0_42px_90px_-36px_rgba(14,13,11,0.72)]"
                    : "shadow-[0_20px_50px_-34px_rgba(14,13,11,0.56)]",
                )}
                style={{
                  borderColor: isActive
                    ? "color-mix(in oklab, var(--album-fg, var(--album-fg-fallback)) 34%, transparent)"
                    : "color-mix(in oklab, var(--album-fg, var(--album-fg-fallback)) 18%, transparent)",
                  backgroundColor:
                    "color-mix(in oklab, var(--album-bg, var(--album-bg-fallback)) 18%, transparent)",
                }}
              >
                <img
                  src={image}
                  alt={album.release_name}
                  onError={handleImageError}
                  loading={isActive ? "eager" : "lazy"}
                  className={cn(
                    "h-full w-full object-cover transition-transform duration-700 ease-out",
                    isActive ? "scale-[1.01] group-hover:scale-[1.03]" : "group-hover:scale-[1.02]",
                  )}
                />

                <div
                  className="absolute inset-0"
                  style={{
                    background: isActive
                      ? "linear-gradient(180deg, rgba(9,8,7,0.04) 0%, rgba(9,8,7,0.08) 42%, rgba(9,8,7,0.26) 100%)"
                      : "linear-gradient(180deg, transparent 52%, rgba(9,8,7,0.28) 100%)",
                  }}
                />

                {isActive ? null : (
                  <span className="absolute inset-x-3 bottom-3 font-mono text-[9px] uppercase tracking-[0.14em] text-[rgba(246,242,233,0.76)]">
                    {position}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getCoverflowCardStyle(
  offset: number,
  isDesktopCoverflow: boolean,
): React.CSSProperties {
  const abs = Math.abs(offset);

  if (!isDesktopCoverflow) {
    return {
      transform:
        abs === 0
          ? "translate3d(0, 0, 0) scale(1)"
          : "translate3d(0, 16px, 0) scale(0.92)",
      opacity: abs === 0 ? 1 : 0.72,
      zIndex: 40 - abs,
    };
  }

  if (abs === 0) {
    return {
      transform: "translate3d(0, 0, 0) scale(1.08)",
      opacity: 1,
      zIndex: 100,
    };
  }

  if (abs === 1) {
    const direction = offset < 0 ? 1 : -1;
    return {
      transform: `translate3d(${direction * 28}px, 44px, 0) scale(0.82) rotateY(${direction * 22}deg)`,
      opacity: 0.76,
      zIndex: 80,
      filter: "saturate(0.86)",
    };
  }

  if (abs === 2) {
    const direction = offset < 0 ? 1 : -1;
    return {
      transform: `translate3d(${direction * 76}px, 88px, 0) scale(0.66) rotateY(${direction * 30}deg)`,
      opacity: 0.46,
      zIndex: 60,
      filter: "saturate(0.72)",
    };
  }

  if (abs === 3) {
    const direction = offset < 0 ? 1 : -1;
    return {
      transform: `translate3d(${direction * 122}px, 114px, 0) scale(0.56) rotateY(${direction * 34}deg)`,
      opacity: 0.28,
      zIndex: 48,
      filter: "saturate(0.6)",
    };
  }

  const direction = offset < 0 ? 1 : -1;
  return {
    transform: `translate3d(${direction * 156}px, 136px, 0) scale(0.46) rotateY(${direction * 38}deg)`,
    opacity: abs > 4 ? 0.08 : 0.16,
    zIndex: 32,
    filter: "saturate(0.54)",
  };
}
