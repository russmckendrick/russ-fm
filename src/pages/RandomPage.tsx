import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw, Shuffle } from 'lucide-react';
import { GenreTag } from '@/components/ui/genre-tag';
import { PageContainer, StageVinyl } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';
import { useAlbumColors } from '@/hooks/useAlbumColors';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';

type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

const addedDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Single-record random spin. This route intentionally shows exactly one
 * album at a time: no preview queue, no secondary grid, just a focused
 * pull from the collection with a quick way to spin again.
 */
export function RandomPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [isShuffling, setIsShuffling] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const timersRef = useRef<number[]>([]);

  const albumPath = currentAlbum ? getAlbumPath(currentAlbum.uri_release) : '';
  const colors = useAlbumColors(currentAlbum?.uri_release);
  const heroTint = colors?.background ?? 'var(--paper-2)';
  const heroAccent = colors?.accent ?? 'var(--hl)';

  usePageTitle('Random Discovery | Russ.fm');

  const clearShuffleTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const scheduleShuffleTimer = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((activeTimer) => activeTimer !== timer);
      callback();
    }, delay);
    timersRef.current.push(timer);
  }, []);

  const loadCollection = useCallback(async () => {
    clearShuffleTimers();
    setStatus('loading');
    setIsShuffling(false);
    setIsVisible(true);

    try {
      const response = await fetch('/collection.json');
      if (!response.ok) {
        throw new Error(`Collection request failed: ${response.status}`);
      }

      const collection = (await response.json()) as Album[];
      const validAlbums = collection.filter((album) => album.uri_release && album.release_name);

      setAlbums(validAlbums);
      setCurrentAlbum(pickRandomAlbum(validAlbums));
      setStatus(validAlbums.length > 0 ? 'ready' : 'empty');
    } catch (error) {
      console.error('Error loading collection:', error);
      setAlbums([]);
      setCurrentAlbum(null);
      setStatus('error');
    }
  }, [clearShuffleTimers]);

  useEffect(() => {
    void loadCollection();
    return clearShuffleTimers;
  }, [loadCollection, clearShuffleTimers]);

  const handleShuffle = useCallback(() => {
    if (isShuffling || albums.length === 0) return;

    setIsShuffling(true);
    setIsVisible(false);

    scheduleShuffleTimer(() => {
      setCurrentAlbum((previousAlbum) =>
        pickRandomAlbum(albums, previousAlbum?.uri_release)
      );

      scheduleShuffleTimer(() => {
        setIsVisible(true);
        setIsShuffling(false);
      }, 90);
    }, 240);
  }, [albums, isShuffling, scheduleShuffleTimer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;

      const target = event.target as HTMLElement | null;
      if (
        target?.closest('a, button, input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }

      event.preventDefault();
      handleShuffle();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleShuffle]);

  const year = useMemo(
    () => formatYear(currentAlbum?.date_release_year),
    [currentAlbum?.date_release_year],
  );

  const addedDate = useMemo(
    () => formatAddedDate(currentAlbum?.date_added),
    [currentAlbum?.date_added],
  );

  const genres = useMemo(() => {
    if (!currentAlbum) return [] as string[];
    return getCleanGenresFromArray(
      currentAlbum.genre_names,
      currentAlbum.release_artist,
    ).slice(0, 4);
  }, [currentAlbum]);

  if (status === 'loading') {
    return <RandomPageSkeleton />;
  }

  if (status === 'error') {
    return (
      <RandomPageMessage
        eyebrow="Random · Collection"
        title="The crate did not load"
        detail="Try the random spin again once the collection data is reachable."
        action={
          <button
            type="button"
            onClick={() => void loadCollection()}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-paper transition-[background-color,border-color,color,transform] duration-200 hover:border-hl hover:bg-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-y-px"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Retry Spin
          </button>
        }
      />
    );
  }

  if (status === 'empty' || !currentAlbum) {
    return (
      <RandomPageMessage
        eyebrow="Random · Collection"
        title="There are no records to spin"
        detail="The random page needs at least one album in collection.json."
      />
    );
  }

  const albumHref = `/album/${albumPath}`;
  const artistHref = currentAlbum.artists?.[0]?.uri_artist ?? currentAlbum.uri_artist;
  const genreSummary = genres.length ? genres.join(', ') : 'Collection';
  const titleStyle = getTitleStyle(currentAlbum.release_name);

  return (
    <PageContainer variant="hero" className="bg-paper">
      <section
        className="relative isolate min-h-[calc(100dvh-5rem)] overflow-hidden border-b border-rule bg-paper font-grot text-ink"
        aria-busy={isShuffling}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.1] transition-[background,opacity] duration-700 ease-out motion-reduce:transition-none md:opacity-[0.12]"
          style={{
            background: `radial-gradient(circle at 58% 24%, ${heroTint} 0%, transparent 36%)`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38vw] border-l border-rule bg-paper-2/35 lg:block"
        />

        <p className="sr-only" aria-live="polite">
          Random record selected: {currentAlbum.release_name} by {currentAlbum.release_artist}.
        </p>

        <div className="relative mx-auto grid min-h-[calc(100dvh-5rem)] w-full max-w-[1640px] gap-10 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.82fr)_220px] lg:items-center lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(440px,0.86fr)_250px]">
          <div
            className={cn(
              'min-w-0 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
            )}
          >
            <header className="max-w-[760px]">
              <div className="mb-5 flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
                <span className="text-hl">Random</span>
                <span aria-hidden>·</span>
                <span>Single Record Spin</span>
              </div>

              <h1 className="text-display break-words uppercase text-ink" style={titleStyle}>
                <Link
                  to={albumHref}
                  className="transition-colors duration-200 hover:text-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
                >
                  {currentAlbum.release_name}
                </Link>
              </h1>

              <Link
                to={artistHref}
                className="mt-5 inline-block max-w-full truncate font-display text-[22px] uppercase leading-none text-ink-3 transition-colors duration-200 hover:text-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink md:text-[28px]"
              >
                {currentAlbum.release_artist}
              </Link>

              <p className="mt-5 max-w-[48ch] font-mono text-[12px] leading-[1.65] text-ink-2 md:text-[13px]">
                A single pull from the personal record collection. Spin again for a new sleeve, or open the record for the full dossier.
              </p>
            </header>

            {genres.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-1.5" aria-label="Genres">
                {genres.map((genre) => (
                  <Link
                    key={genre}
                    to={`/albums/1?genre=${encodeURIComponent(genre)}`}
                    className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
                  >
                    <GenreTag genre={genre} size="md" linkable={false} />
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleShuffle}
                disabled={isShuffling}
                aria-keyshortcuts="Space"
                className={cn(
                  'inline-flex items-center gap-2 border border-ink bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-paper transition-[background-color,border-color,color,opacity,transform] duration-200 hover:border-hl hover:bg-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-y-px disabled:pointer-events-none disabled:opacity-65',
                )}
              >
                {isShuffling ? (
                  <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Shuffle className="h-4 w-4" aria-hidden />
                )}
                {isShuffling ? 'Spinning…' : 'Spin Again'}
              </button>

              <Link
                to={albumHref}
                className="inline-flex items-center gap-2 border border-rule-strong bg-paper px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-[background-color,border-color,color,transform] duration-200 hover:border-hl hover:text-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-y-px"
              >
                Open Record
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <Link
            to={albumHref}
            className={cn(
              'group relative mx-auto block w-full max-w-[560px] transition-[opacity,transform] duration-300 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink motion-reduce:transition-none lg:mx-0',
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
            )}
          >
            <StageVinyl className="right-[-20%] top-[9%] hidden w-[76%] lg:block" />
            <div
              className="relative z-[1] aspect-square overflow-hidden border border-rule bg-paper-2 shadow-[0_28px_70px_-36px_rgba(14,13,11,0.45)] transition-shadow duration-500 ease-out"
              style={{
                boxShadow: `0 42px 92px -54px ${heroAccent}, 0 18px 48px -34px rgba(14,13,11,0.42)`,
              }}
            >
              <img
                src={getAlbumImageFromData(currentAlbum.uri_release, 'hi-res')}
                alt={`${currentAlbum.release_name} album artwork`}
                width={720}
                height={720}
                fetchPriority="high"
                draggable={false}
                onError={handleImageError}
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
              />
            </div>
          </Link>

          <aside
            className={cn(
              'min-w-0 border-y border-rule-strong transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none lg:border-y-0',
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
            )}
            aria-label="Selected record metadata"
          >
            <dl>
              <MetaRail label="Released" value={year || '—'} />
              <MetaRail label="Added" value={addedDate} />
              <MetaRail label="Genres" value={genreSummary} />
              <MetaRail label="Mode" value="Random Spin" />
            </dl>
          </aside>
        </div>
      </section>
    </PageContainer>
  );
}

function RandomPageSkeleton() {
  return (
    <PageContainer variant="hero" className="bg-paper">
      <section
        className="relative min-h-[calc(100dvh-5rem)] overflow-hidden border-b border-rule bg-paper font-grot text-ink"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="mx-auto grid min-h-[calc(100dvh-5rem)] w-full max-w-[1640px] gap-10 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.82fr)_220px] lg:items-center lg:gap-12">
          <div className="min-w-0">
            <div className="mb-5 h-3 w-48 animate-pulse bg-rule" />
            <div className="h-16 w-full max-w-[520px] animate-pulse bg-rule md:h-24" />
            <div className="mt-3 h-10 w-72 max-w-full animate-pulse bg-rule" />
            <div className="mt-7 h-4 w-full max-w-[430px] animate-pulse bg-rule" />
            <div className="mt-2 h-4 w-3/4 max-w-[360px] animate-pulse bg-rule" />
            <div className="mt-8 flex gap-2">
              <div className="h-11 w-36 animate-pulse bg-rule" />
              <div className="h-11 w-36 animate-pulse bg-rule" />
            </div>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              Loading Random Spin…
            </p>
          </div>

          <div className="mx-auto aspect-square w-full max-w-[560px] animate-pulse bg-rule lg:mx-0" />

          <div className="border-y border-rule-strong lg:border-y-0">
            {['Released', 'Added', 'Genres', 'Mode'].map((label) => (
              <div key={label} className="border-b border-rule py-4 last:border-b-0 lg:py-5">
                <div className="h-3 w-20 animate-pulse bg-rule" />
                <div className="mt-3 h-6 w-32 animate-pulse bg-rule" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}

function RandomPageMessage({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <PageContainer variant="hero" className="bg-paper">
      <section className="min-h-[calc(100dvh-5rem)] border-b border-rule bg-paper px-5 py-16 font-grot text-ink md:px-8">
        <div className="mx-auto flex min-h-[56vh] max-w-[1640px] items-center">
          <div className="max-w-[720px] border-y border-rule-strong py-10">
            <div className="mb-5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              {eyebrow}
            </div>
            <h1 className="text-display max-w-[10ch] break-words text-[clamp(48px,8vw,104px)] uppercase text-ink">
              {title}
            </h1>
            <p className="mt-5 max-w-[48ch] text-[16px] leading-[1.65] text-ink-2">
              {detail}
            </p>
            {action && <div className="mt-8">{action}</div>}
          </div>
        </div>
      </section>
    </PageContainer>
  );
}

function MetaRail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-rule py-4 last:border-b-0 lg:py-5">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </dt>
      <dd className="mt-2 min-w-0 break-words font-display text-[19px] uppercase leading-tight text-ink">
        {value}
      </dd>
    </div>
  );
}

function pickRandomAlbum(pool: Album[], currentUri?: string): Album | null {
  if (pool.length === 0) return null;
  const candidates = currentUri
    ? pool.filter((album) => album.uri_release !== currentUri)
    : pool;
  const nextPool = candidates.length > 0 ? candidates : pool;
  return nextPool[Math.floor(Math.random() * nextPool.length)] ?? null;
}

function getAlbumPath(uriRelease: string): string {
  return uriRelease.replace('/album/', '').replace('/', '');
}

function formatYear(value: string | undefined): string {
  if (!value) return '';
  return value.match(/\d{4}/)?.[0] ?? '';
}

function formatAddedDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return addedDateFormatter.format(date).toUpperCase();
}

function getTitleStyle(title: string): CSSProperties {
  const words = title.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
  const charCount = title.length;

  let maxPx = 118;
  let preferredVw = 8.2;
  let maxWidth = 'min(100%, 10.4ch)';

  if (longestWord >= 18 || charCount >= 46) {
    maxPx = 68;
    preferredVw = 4.8;
    maxWidth = 'min(100%, 14ch)';
  } else if (longestWord >= 13 || charCount >= 34) {
    maxPx = 84;
    preferredVw = 5.8;
    maxWidth = 'min(100%, 12.8ch)';
  } else if (longestWord >= 11 || charCount >= 24) {
    maxPx = 98;
    preferredVw = 6.8;
    maxWidth = 'min(100%, 11.4ch)';
  }

  return {
    fontSize: `clamp(46px, ${preferredVw}vw, ${maxPx}px)`,
    maxWidth,
    lineHeight: 0.9,
  };
}
