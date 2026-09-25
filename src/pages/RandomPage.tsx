import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { usePageTitle } from '@/hooks/usePageTitle';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { loadCollection as loadSharedCollection } from '@/lib/collection';
import type { Album } from '@/types/album';

type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

const RandomCrateScene = lazy(() => import('./random/RandomCrateScene'));

export function RandomPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  usePageTitle('Shuffle | Russ.fm');

  const loadCollection = useCallback(async () => {
    setStatus('loading');

    try {
      const collection = excludeBoxsetMembers(await loadSharedCollection());
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
        title="The crate didn't load"
        detail="The collection couldn't be fetched. Try again in a moment."
        action={
          <button
            type="button"
            onClick={() => void loadCollection()}
            className="pill pill-solid pill-lg"
            style={{ background: 'var(--cream)', color: 'var(--ground)' }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        }
      />
    );
  }

  if (status === 'empty') {
    return <RandomPageMessage title="No records to shuffle" detail="The collection is empty." />;
  }

  return (
    <PageContainer variant="hero">
      <Suspense fallback={<RandomCrateFallback />}>
        <RandomCrateScene albums={albums} />
      </Suspense>
    </PageContainer>
  );
}

function RandomPageSkeleton() {
  return (
    <PageContainer variant="hero">
      <RandomCrateFallback label="Loading collection" />
    </PageContainer>
  );
}

/** Shown while the collection or the three.js chunk loads: a dark stage with a pulsing sleeve. */
function RandomCrateFallback({ label = 'Building the crate' }: { label?: string }) {
  return (
    <section
      className="relative min-h-[calc(100svh-64px)] overflow-hidden bg-[color:var(--ground)] font-grot text-[color:var(--cream)] md:min-h-[calc(100svh-84px)]"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        aria-hidden
        className="absolute left-1/2 top-[42%] aspect-square w-[min(58vw,440px)] -translate-x-1/2 -translate-y-1/2 animate-pulse bg-[color:var(--ground-3)] shadow-[0_40px_90px_-40px_rgba(0,0,0,.8)] motion-reduce:animate-none"
      />
      <div className="absolute bottom-[92px] left-4 right-4 z-10 rounded-3xl bg-[color:var(--ground-2)] p-5 sm:bottom-8 sm:left-8 sm:right-auto sm:w-[min(460px,calc(100vw-4rem))] sm:p-6">
        <div className="mb-3 h-4 w-32 animate-pulse rounded-full bg-[color:var(--ground-3)] motion-reduce:animate-none" />
        <div className="h-10 w-full max-w-[340px] animate-pulse rounded-xl bg-[color:var(--ground-3)] motion-reduce:animate-none" />
        <p className="t-mono mt-5 text-[12px] uppercase text-[color:var(--cream-dim)]">{label}</p>
      </div>
    </section>
  );
}

function RandomPageMessage({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <PageContainer variant="hero">
      <section className="mx-auto flex min-h-[calc(100svh-64px)] w-full max-w-[1640px] items-center px-5 py-16 font-grot md:min-h-[calc(100svh-84px)] md:px-10 lg:px-14">
        <div className="max-w-[760px]">
          <p className="t-kicker mb-5 text-[color:var(--cream-dim)]">Shuffle</p>
          <h1 className="t-disp break-words text-[clamp(44px,8vw,104px)]">{title}</h1>
          <p className="mt-5 max-w-[48ch] text-[17px] leading-[1.6] text-[color:var(--cream-dim)]">{detail}</p>
          {action && <div className="mt-8">{action}</div>}
        </div>
      </section>
    </PageContainer>
  );
}
