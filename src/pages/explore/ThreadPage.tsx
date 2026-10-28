import { usePageTitle } from '@/hooks/usePageTitle';
import { useExplore } from '@/lib/explore/data';
import { ThreadFeed } from '@/components/explore/thread/ThreadFeed';
import '@/components/explore/thread/thread.css';

/**
 * /explore/thread: The Thread, an endless feed of hops between artists and records,
 * each card saying how it connects to the last. `?seed=<artist>` or
 * `?album=<album>` picks the start; `?trail=a,b,c&r=<seed>` replays a shared
 * trail. See docs/frontend/explore-thread.md.
 */
export function ExploreThreadPage() {
  const { data, error, retry } = useExplore();
  usePageTitle('The Thread | Explore | Russ.fm');

  if (error) {
    return (
      <div className="thr-page">
        <div className="thr-status">
          <div>
            <p className="t-disp text-[28px]">Explore didn't load</p>
            <button type="button" className="pill mt-6" onClick={retry}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="thr-page" aria-busy="true" aria-label="Loading Explore">
        <div className="thr-status">
          <div className="h-[70%] w-full max-w-[420px] animate-pulse rounded-[20px] bg-[color:var(--ground-2)] motion-reduce:animate-none" />
        </div>
      </div>
    );
  }
  return <ThreadFeed d={data} />;
}
