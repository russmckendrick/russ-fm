import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import type { Album } from '@/types/album';

type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

const RandomCrateScene = lazy(() => import('./random/RandomCrateScene'));

export function RandomPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  usePageTitle('Random Discovery | Russ.fm');

  const loadCollection = useCallback(async () => {
    setStatus('loading');

    try {
      const response = await fetch('/collection.json');
      if (!response.ok) {
        throw new Error(`Collection request failed: ${response.status}`);
      }

      const collection = excludeBoxsetMembers((await response.json()) as Album[]);
      const validAlbums = collection.filter(
        (album) => album.uri_release && album.release_name && album.release_artist,
      );

      setAlbums(validAlbums);
      setStatus(validAlbums.length > 0 ? 'ready' : 'empty');
    } catch (error) {
      console.error('Error loading collection:', error);
      setAlbums([]);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadCollection();
  }, [loadCollection]);

  if (status === 'loading') {
    return <RandomPageSkeleton />;
  }

  if (status === 'error') {
    return (
      <RandomPageMessage
        eyebrow="Random / Collection"
        title="The crate did not load"
        detail="Try the random crate again once the collection data is reachable."
        action={
          <button
            type="button"
            onClick={() => void loadCollection()}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-paper transition-[background-color,border-color,color,transform] duration-200 hover:border-hl hover:bg-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-y-px"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Retry Crate
          </button>
        }
      />
    );
  }

  if (status === 'empty') {
    return (
      <RandomPageMessage
        eyebrow="Random / Collection"
        title="There are no records to spin"
        detail="The random crate needs at least one album in collection.json."
      />
    );
  }

  return (
    <PageContainer variant="hero" className="bg-paper">
      <Suspense fallback={<RandomCrateFallback />}>
        <RandomCrateScene albums={albums} />
      </Suspense>
    </PageContainer>
  );
}

function RandomPageSkeleton() {
  return (
    <PageContainer variant="hero" className="bg-paper">
      <RandomCrateFallback label="Loading Random Crate" />
    </PageContainer>
  );
}

function RandomCrateFallback({ label = 'Building Random Crate' }: { label?: string }) {
  return (
    <section
      className="relative min-h-[calc(100dvh-5rem)] overflow-hidden border-b border-rule bg-paper font-grot text-ink"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_oklab,var(--paper-warm)_48%,transparent),transparent_58%),repeating-linear-gradient(0deg,color-mix(in_oklab,var(--ink)_4%,transparent)_0,color-mix(in_oklab,var(--ink)_4%,transparent)_1px,transparent_1px,transparent_7px)]"
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[min(58vw,520px)] w-[min(58vw,520px)] -translate-x-1/2 -translate-y-1/2 animate-pulse border border-rule-strong bg-paper-2 shadow-[0_40px_90px_-52px_rgba(14,13,11,0.55)] motion-reduce:animate-none"
      />
      <div className="absolute bottom-[92px] left-4 right-4 z-10 border border-rule bg-paper/80 p-4 shadow-[0_18px_46px_-30px_rgba(14,13,11,0.45)] backdrop-blur-xl sm:bottom-8 sm:left-8 sm:right-auto sm:w-[min(440px,calc(100vw-4rem))]">
        <div className="mb-3 h-3 w-36 animate-pulse bg-rule motion-reduce:animate-none" />
        <div className="h-10 w-full max-w-[360px] animate-pulse bg-rule motion-reduce:animate-none" />
        <div className="mt-3 h-4 w-56 max-w-full animate-pulse bg-rule motion-reduce:animate-none" />
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          {label}
        </p>
      </div>
    </section>
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
