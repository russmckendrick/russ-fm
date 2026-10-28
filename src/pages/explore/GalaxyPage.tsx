import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { usePageFlood } from '@/components/player';
import { GalaxyHud } from '@/components/explore/galaxy/GalaxyHud';
import { GalaxyPanel } from '@/components/explore/galaxy/GalaxyPanel';
import type { GalaxyHandle } from '@/components/explore/galaxy/GalaxyCanvas';
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useExplore } from '@/lib/explore/data';
import { leadRecord, linkBetween, pathAfterVisit, prepareGalaxy } from '@/lib/explore/galaxyLayout';
import { computeLayout } from '@/lib/explore/galaxyWorkerClient';

// Three.js and the scene load only here, in their own chunk.
const GalaxyCanvas = lazy(() => import('@/components/explore/galaxy/GalaxyCanvas'));

const NO_PANEL = { right: 0, bottom: 0 };

/**
 * /explore and /explore/:artist (the default Explore page): The Galaxy, every artist in the
 * collection as a star in 3D, grouped into the 12 genre families, with light
 * trails for shared members, guest spots and credits. The URL follows the
 * focused artist, so every hop is a shareable link and Back retraces it.
 */
export function ExploreGalaxyPage() {
  const { artist: slug } = useParams<{ artist: string }>();
  const navigate = useNavigate();
  const { data, error, retry } = useExplore();
  const prep = useMemo(() => (data ? prepareGalaxy(data) : null), [data]);
  const phone = !useMediaQuery('(min-width: 768px)');
  const reducedMotion = usePrefersReducedMotion();

  // layout: cached, else worked out in a worker
  const [layout, setLayout] = useState<{ positions: Float32Array | null; progress: number }>({ positions: null, progress: 0 });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!data || !prep) return;
    const job = computeLayout(data, prep, progress => setLayout(l => ({ ...l, progress })));
    let live = true;
    job.promise
      .then(positions => live && setLayout({ positions, progress: 1 }))
      .catch(err => {
        console.error('Galaxy layout failed:', err);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
      job.cancel();
    };
  }, [data, prep]);
  const [sceneReady, setSceneReady] = useState(false);

  const found = slug && data ? data.artistBySlug.get(slug) : undefined;
  const focus = found != null && prep && !prep.hidden[found] ? found : null;

  // the hop path and the link just travelled, kept in step with the URL
  const [trail, setTrail] = useState<{ focus: number | null; path: number[]; link: number }>({ focus: null, path: [], link: -1 });
  if (prep && trail.focus !== focus) {
    setTrail({
      focus,
      path: focus == null ? [] : pathAfterVisit(trail.path, focus),
      link: focus != null && trail.focus != null ? linkBetween(prep, trail.focus, focus) : -1,
    });
  }

  const go = useCallback((i: number) => data && navigate(`/explore/${data.artists[i].slug}`), [data, navigate]);
  const close = useCallback(() => navigate('/explore'), [navigate]);
  const handle = useRef<GalaxyHandle | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focus != null && !(e.target instanceof HTMLInputElement)) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, close]);

  // the nav and the sky take the focused artist's colours
  const lead = data && focus != null ? leadRecord(data, focus) : null;
  const leadAlbum = data && lead != null ? data.albums[lead] : null;
  usePageFlood(leadAlbum?.fl, leadAlbum?.ink);
  const artistName = data && focus != null ? data.artists[focus].name : null;
  useMetaTags({
    title: artistName ? `${artistName} | The Galaxy | Explore | Russ.fm` : 'The Galaxy | Explore | Russ.fm',
    description: artistName
      ? `${artistName} on a map of every artist in Russ McKendrick's record collection, with the people they share.`
      : "A map of every artist in Russ McKendrick's record collection, grouped by genre and joined by the people they share.",
  });

  // room the panel takes, so the focused star centres beside or above it
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  const [panelInsets, setPanelInsets] = useState(NO_PANEL);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!panelEl) {
      setPanelInsets(NO_PANEL);
      return;
    }
    const measure = () => {
      const host = panelEl.offsetParent as HTMLElement | null;
      if (!host) return;
      setPanelInsets(phone ? { right: 0, bottom: host.clientHeight - panelEl.offsetTop + 8 } : { right: host.clientWidth - panelEl.offsetLeft + 8, bottom: 0 });
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(panelEl);
    return () => obs.disconnect();
  }, [panelEl, phone]);
  const [hudEl, setHudEl] = useState<HTMLElement | null>(null);
  const [hud, setHud] = useState({ hudRight: 0, hudBottom: 0 });
  useEffect(() => {
    if (!hudEl) return;
    const measure = () => setHud({ hudRight: hudEl.offsetLeft + hudEl.offsetWidth + 8, hudBottom: hudEl.offsetTop + hudEl.offsetHeight + 8 });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(hudEl);
    return () => obs.disconnect();
  }, [hudEl]);
  const insets = useMemo(() => ({ ...(focus != null ? panelInsets : NO_PANEL), ...hud }), [focus, panelInsets, hud]);

  const [touched, setTouched] = useState(false);
  const random = useCallback(() => {
    if (!prep) return;
    const pool = prep.linksOf.map((ks, i) => (ks.length >= 2 && !prep.hidden[i] ? i : -1)).filter(i => i >= 0 && i !== focus);
    if (pool.length) go(pool[Math.floor(Math.random() * pool.length)]);
  }, [prep, focus, go]);
  const home = useCallback(() => {
    if (focus != null) close();
    handle.current?.flyHome();
  }, [focus, close]);
  const onFamily = useCallback(() => {
    if (focus != null) close();
  }, [focus, close]);

  if (error || failed) {
    return (
      <GalaxyShell>
        <div className="flex h-full flex-col items-start justify-center gap-6 px-6 md:px-14">
          <h1 className="t-disp m-0 text-[34px] md:text-[48px]">The map didn&rsquo;t load</h1>
          <button type="button" onClick={() => (setFailed(false), retry())} className="pill pill-solid pill-lg" style={{ background: 'var(--cream)', color: 'var(--ground)' }}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </div>
      </GalaxyShell>
    );
  }

  const ready = !!(data && prep && layout.positions);
  return (
    <GalaxyShell>
      <p className="sr-only">
        A 3D map of every artist in the collection, grouped into genre families. Search for an artist to see who they connect to and why; the details panel lists every
        connection as a link.
      </p>
      {ready && (
        <Suspense fallback={null}>
          <GalaxyCanvas
            data={data}
            prep={prep}
            positions={layout.positions!}
            focus={trail.focus}
            link={trail.link}
            reducedMotion={reducedMotion}
            insets={insets}
            ground={leadAlbum?.gr ?? null}
            onSelect={go}
            onOpenAlbum={album => navigate(`/album/${data.albums[album].slug}`)}
            onFamily={onFamily}
            onInteract={() => setTouched(true)}
            onReady={() => setSceneReady(true)}
            handle={handle}
          />
        </Suspense>
      )}
      {data && prep && <GalaxyHud boxRef={setHudEl} data={data} prep={prep} phone={phone} showHint={!touched && focus == null} onGo={go} onRandom={random} onHome={home} />}
      {data && prep && focus != null && (
        <GalaxyPanel
          key={focus}
          ref={setPanelEl}
          data={data}
          prep={prep}
          artist={focus}
          path={trail.path}
          phone={phone}
          collapsed={phone && collapsed}
          onToggle={() => setCollapsed(c => !c)}
          onGo={go}
          onClose={close}
        />
      )}
      {!sceneReady && (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#0e0d0c]" role="status">
          <span className="t-kicker">Drawing the map</span>
          <span className="h-0.5 w-48 overflow-hidden rounded-full bg-[color:var(--cream-rule)]">
            <span className="block h-full bg-[color:var(--cream)] transition-[width] duration-200" style={{ width: `${Math.round((data ? 0.15 + layout.progress * 0.8 : 0.05) * 100)}%` }} />
          </span>
        </div>
      )}
    </GalaxyShell>
  );
}

/** Fills the screen under the sticky nav (64px, 84px from md). */
function GalaxyShell({ children }: { children: React.ReactNode }) {
  return <div className="relative h-[calc(100dvh-64px)] w-full overflow-hidden bg-[#0e0d0c] text-[color:var(--cream)] md:h-[calc(100dvh-84px)]">{children}</div>;
}
