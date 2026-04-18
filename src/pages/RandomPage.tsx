import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Shuffle, RefreshCw, ArrowRight } from 'lucide-react';
import { GenreTag } from '@/components/ui/genre-tag';
import { PageContainer, SectionHeader } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';
import { useAlbumColors } from '@/hooks/useAlbumColors';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { redesignConfig } from '@/config/redesign.config';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';

/**
 * Editorial random-record surface. A tinted wash picks up the cover's
 * dominant colour; the sleeve sits left, a KV strip + chip row + action
 * row sit right. A peek strip of upcoming possibilities lives below,
 * each one clickable to jump straight to that record. Space bar on
 * desktop re-shuffles; the tint crossfades with the sleeve.
 */
export function RandomPage() {
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [queue, setQueue] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isShuffling, setIsShuffling] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const peekCount = redesignConfig.random.peekCount;
  const currentAlbum = queue[0] ?? null;
  const peekAlbums = queue.slice(1, 1 + peekCount);

  const albumPath = currentAlbum?.uri_release.replace('/album/', '').replace('/', '') || '';
  const colors = useAlbumColors(albumPath);

  usePageTitle('Random Discovery | Russ.fm');

  // Build a fresh shuffled deck
  const shuffleDeck = useCallback((pool: Album[], keep?: Album) => {
    const deck = [...pool].sort(() => Math.random() - 0.5);
    // Ensure the currently-shown record doesn't get re-picked as the next one
    if (keep && deck[0]?.uri_release === keep.uri_release && deck.length > 1) {
      [deck[0], deck[1]] = [deck[1], deck[0]];
    }
    return deck;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/collection.json');
        const albums: Album[] = await response.json();
        if (cancelled) return;
        setAllAlbums(albums);
        setQueue([...albums].sort(() => Math.random() - 0.5));
      } catch (error) {
        console.error('Error loading collection:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const advanceTo = useCallback((next: Album) => {
    setQueue((prev) => {
      const rest = prev.filter(a => a.uri_release !== next.uri_release);
      // Keep a fresh deck behind `next` so the peek strip stays populated.
      const tail = rest.length > peekCount
        ? rest
        : shuffleDeck(allAlbums, next);
      return [next, ...tail.filter(a => a.uri_release !== next.uri_release)];
    });
  }, [allAlbums, peekCount, shuffleDeck]);

  const handleShuffle = useCallback((targetOverride?: Album) => {
    if (!queue.length) return;
    setIsShuffling(true);
    setIsVisible(false);
    const target = targetOverride ?? queue[1] ?? queue[0];
    window.setTimeout(() => {
      advanceTo(target);
      // Re-fade in
      window.setTimeout(() => {
        setIsVisible(true);
        setIsShuffling(false);
      }, 80);
    }, 280);
  }, [queue, advanceTo]);

  // Space-bar shuffle (desktop)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.code !== 'Space') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target.isContentEditable) return;
      event.preventDefault();
      if (!isShuffling) handleShuffle();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShuffling, handleShuffle]);

  const year = useMemo(() => {
    if (!currentAlbum) return '';
    const y = new Date(currentAlbum.date_release_year).getFullYear();
    return Number.isFinite(y) ? String(y) : '';
  }, [currentAlbum]);

  const genres = useMemo(() => {
    if (!currentAlbum) return [] as string[];
    return getCleanGenresFromArray(
      currentAlbum.genre_names,
      currentAlbum.release_artist,
    ).slice(0, 4);
  }, [currentAlbum]);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="py-16 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          Flipping the crate…
        </div>
      </PageContainer>
    );
  }

  if (!currentAlbum) return null;

  const albumHref = `/album/${albumPath}`;
  const heroTint = colors?.background ?? 'var(--paper-2)';

  return (
    <PageContainer variant="hero">
      {/* Hero ------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden bg-paper">
        <div
          className="pointer-events-none absolute inset-0 transition-[background] duration-700 ease-out motion-reduce:transition-none"
          style={{
            background: `linear-gradient(135deg, ${heroTint} 0%, transparent 65%)`,
            mixBlendMode: 'multiply',
            opacity: 0.85,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 hidden transition-[background] duration-700 ease-out motion-reduce:transition-none dark:block"
          style={{
            background: `linear-gradient(135deg, ${heroTint} 0%, transparent 65%)`,
            mixBlendMode: 'screen',
            opacity: 0.7,
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-[1640px] px-5 pb-14 pt-10 md:px-8 md:pb-20 md:pt-14">
          <div className="mb-8 flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
            <span className="text-hl">RANDOM</span>
            <span>·</span>
            <span>SHUFFLE THE CRATE</span>
            <span className="ml-auto hidden md:inline">
              Press <kbd className="border border-rule-strong bg-paper px-1.5 py-0.5 text-ink">Space</kbd> to shuffle
            </span>
          </div>

          <div
            className={cn(
              "grid gap-10 transition-opacity duration-300 ease-out md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-14 motion-reduce:transition-none",
              isVisible ? "opacity-100" : "opacity-0",
            )}
          >
            {/* Sleeve */}
            <Link
              to={albumHref}
              className="mx-auto block w-full max-w-[420px] shrink-0 md:mx-0 md:w-[380px] lg:w-[440px]"
            >
              <div
                className="aspect-square w-full overflow-hidden bg-paper-2"
                style={{
                  boxShadow: `0 40px 80px -20px ${heroTint}, 0 6px 20px -6px rgba(14,13,11,0.15)`,
                }}
              >
                <img
                  src={getAlbumImageFromData(currentAlbum.uri_release, 'hi-res')}
                  alt={currentAlbum.release_name}
                  onError={handleImageError}
                  className="h-full w-full object-cover"
                />
              </div>
            </Link>

            {/* Text column */}
            <div className="flex min-w-0 flex-col gap-6">
              <div>
                <h1 className="font-grot text-[clamp(40px,7vw,92px)] font-semibold leading-[0.98] tracking-[-0.025em] text-ink">
                  <Link to={albumHref} className="transition-colors hover:text-hl">
                    {currentAlbum.release_name}
                  </Link>
                </h1>
                <div className="mt-3 font-grot text-[20px] font-medium text-ink-2 md:text-[24px]">
                  <Link to={currentAlbum.uri_artist} className="transition-colors hover:text-hl">
                    {currentAlbum.release_artist}
                  </Link>
                </div>
              </div>

              {/* KV strip */}
              <dl className="grid max-w-lg grid-cols-2 gap-[1px] border border-rule-strong bg-rule-strong">
                <KV label="Year" value={year || '—'} />
                <KV
                  label="Added"
                  value={currentAlbum.date_added
                    ? new Date(currentAlbum.date_added).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', year: '2-digit',
                      }).toUpperCase()
                    : '—'}
                />
              </dl>

              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {genres.map((g) => (
                    <GenreTag key={g} genre={g} size="md" linkable />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleShuffle()}
                  disabled={isShuffling}
                  className={cn(
                    "inline-flex items-center gap-2 border border-ink bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-paper transition-colors hover:bg-hl hover:border-hl",
                    isShuffling && "opacity-70",
                  )}
                >
                  {isShuffling ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shuffle className="h-4 w-4" />
                  )}
                  {isShuffling ? 'Flipping…' : 'Shuffle'}
                </button>

                <Link
                  to={albumHref}
                  className="inline-flex items-center gap-2 border border-rule-strong bg-paper px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-colors hover:bg-paper-2"
                >
                  Open record
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Peek strip ------------------------------------------------- */}
      {peekAlbums.length > 0 && (
        <div className="mx-auto w-full max-w-[1640px] px-5 py-12 md:px-8 md:py-16">
          <SectionHeader num="01" label="Coming up in the crate" count={peekAlbums.length} />
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            {peekAlbums.map((album) => (
              <li key={album.uri_release}>
                <button
                  type="button"
                  onClick={() => handleShuffle(album)}
                  className="group flex w-full flex-col gap-2 text-left"
                >
                  <div className="aspect-square w-full overflow-hidden border border-rule-strong bg-paper-2">
                    <img
                      src={getAlbumImageFromData(album.uri_release, 'medium')}
                      alt=""
                      loading="lazy"
                      onError={handleImageError}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="min-w-0 font-grot text-[13px] font-semibold leading-tight text-ink transition-colors group-hover:text-hl">
                    <span className="block truncate">{album.release_name}</span>
                    <span className="block truncate font-mono text-[10.5px] font-normal uppercase tracking-[0.04em] text-ink-dim">
                      {album.release_artist}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper px-3 py-2.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">
        {label}
      </dt>
      <dd className="mt-1 font-grot text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">
        {value}
      </dd>
    </div>
  );
}
