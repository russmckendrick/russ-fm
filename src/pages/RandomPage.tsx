import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { preloadAlbumColors } from '@/hooks/useAlbumColors';
import { usePageTitle } from '@/hooks/usePageTitle';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { loadCollection as loadSharedCollection } from '@/lib/collection';
import type { Album } from '@/types/album';
import { ShuffleScene } from './random/ShuffleScene';

type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

export function RandomPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  usePageTitle('Shuffle | Russ.fm');

  const loadCollection = useCallback(async () => {
    setStatus('loading');

    try {
      // Colours first too, so the first record drops in its own colour.
      const [loaded] = await Promise.all([loadSharedCollection(), preloadAlbumColors()]);
      const collection = excludeBoxsetMembers(loaded);
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
        title="The collection didn't load"
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
      <ShuffleScene albums={albums} />
    </PageContainer>
  );
}

function RandomPageSkeleton() {
  return (
    <PageContainer variant="hero">
      <RandomPageFallback />
    </PageContainer>
  );
}

/** Shown while the collection loads: a blank sleeve and an empty board. */
function RandomPageFallback() {
  return (
    <section
      className="mx-auto flex min-h-[calc(100svh-64px)] w-full max-w-[1640px] flex-col items-center gap-5 px-5 pb-6 pt-5 sm:gap-7 sm:pb-8 sm:pt-6 font-grot md:min-h-[calc(100svh-84px)] md:px-10 lg:flex-row lg:gap-[clamp(48px,5vw,96px)] lg:px-14 lg:py-14"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        aria-hidden
        className="aspect-square w-[min(54vw,300px)] shrink-0 animate-pulse bg-[color:var(--ground-3)] motion-reduce:animate-none sm:w-[min(50vw,380px)] lg:w-[clamp(340px,34vw,560px)]"
      />
      <div aria-hidden className="w-full min-w-0 lg:max-w-[920px] lg:flex-1">
        <div className="aspect-[5/2] w-full animate-pulse rounded-lg bg-[color:var(--ground-2)] motion-reduce:animate-none" />
      </div>
      <p className="sr-only">Loading collection</p>
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
