import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePageFlood } from '@/components/player';
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { Explore } from '@/lib/explore/data';
import { parseThreadParams, Thread, THREAD_PATH, type Hop, type ThreadNode } from '@/lib/explore/thread';
import { cardImageUrl, cardPalette, entityName } from '@/lib/explore/threadCards';
import { dragAxis, rubberBand, springStep, swipeDirection } from '@/lib/explore/threadMotion';
import { ThreadCard } from './ThreadCard';
import { ThreadDetails } from './ThreadDetails';
import { ThreadSheet } from './ThreadSheet';
import { ThreadTrail } from './ThreadTrail';
import './thread.css';

/** A card on screen: its node, its place in the trail and, for branches, which side it waits on. */
interface Placed {
  node: ThreadNode;
  k: number;
  /** 0 = in the trail; -1 / 1 = the previous / next way out beside the current card; 2 = both (only two ways out). */
  side: -1 | 0 | 1 | 2;
}

interface Motion {
  vpos: number;
  vvel: number;
  vTarget: number;
  hoff: number;
  hvel: number;
  hTarget: number;
  drag: null | { x: number; y: number; t: number; axis: 'x' | 'y' | null; v0: number; samples: [number, number, number][]; target: EventTarget | null };
  raf: number;
  last: number;
  W: number;
  H: number;
}

function makeThread(d: Explore, search: string): Thread {
  const p = parseThreadParams(new URLSearchParams(search));
  return new Thread(d, p.r || undefined).start(p);
}

const isTyping = (el: Element | null) => !!el && (el.matches('input, textarea, select, [contenteditable="true"]') || !!el.closest('[contenteditable="true"]'));

/**
 * The Thread: a vertical feed where every card is one hop through the
 * collection and says how it follows the last. Up for the next hop, sideways
 * for another way out of the card before, tap for details. The trail is in
 * the URL (`?trail=…&r=…`) so it can be shared and replays exactly.
 */
export function ThreadFeed({ d }: { d: Explore }) {
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const wide = useMediaQuery('(min-width: 1180px)');

  const [thread, setThread] = useState(() => makeThread(d, location.search));
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [settled, setSettled] = useState<ThreadNode>(thread.current);
  const [sound, setSound] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<number, { el: HTMLElement; media: HTMLElement | null }>());
  const placedRef = useRef<Placed[]>([]);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const m = useRef<Motion>({ vpos: thread.cur, vvel: 0, vTarget: thread.cur, hoff: 0, hvel: 0, hTarget: 0, drag: null, raf: 0, last: 0, W: 1, H: 1 });
  const lastSearch = useRef(location.search);

  // A new search from outside (the nav's Explore link, back/forward) starts again from it.
  useEffect(() => {
    if (location.search === lastSearch.current) return;
    lastSearch.current = location.search;
    const t = makeThread(d, location.search);
    Object.assign(m.current, { vpos: t.cur, vvel: 0, vTarget: t.cur, hoff: 0, hvel: 0, hTarget: 0 });
    setThread(t);
    setSettled(t.current);
    setPlaying(null);
  }, [location.search, d]);

  // ---- which cards are on screen ----
  const cur = thread.cur;
  const placed: Placed[] = [];
  for (let k = Math.max(0, cur - 1); k <= Math.min(thread.trail.length - 1, cur + 1); k++) placed.push({ node: thread.trail[k], k, side: 0 });
  const { left, right } = thread.siblings();
  if (left && right && left === right) placed.push({ node: left, k: cur, side: 2 });
  else {
    if (left) placed.push({ node: left, k: cur, side: -1 });
    if (right) placed.push({ node: right, k: cur, side: 1 });
  }
  placedRef.current = placed;

  // ---- per-frame layout (no React) ----
  const layout = useCallback(() => {
    const s = m.current;
    const t = threadRef.current;
    const red = reducedRef.current;
    for (const p of placedRef.current) {
      const entry = els.current.get(p.node.id);
      if (!entry) continue;
      const { el, media } = entry;
      const offY = p.k - s.vpos;
      const offX = p.side === 0 ? (p.k === t.cur ? s.hoff : 0) : p.side === 2 ? (s.hoff <= 0 ? 1 : -1) + s.hoff : p.side + s.hoff;
      const z = p.side !== 0 ? 3 : p.k === t.cur ? 3 : offY > 0 ? 4 : 2;
      if (red) {
        const o = Math.max(0, 1 - Math.max(Math.abs(offY), Math.abs(offX)));
        el.style.transform = 'none';
        el.style.opacity = o.toFixed(3);
        el.style.zIndex = String(Math.round(10 - Math.max(Math.abs(offY), Math.abs(offX)) * 5));
        el.style.visibility = o > 0.001 ? '' : 'hidden';
        if (media) media.style.transform = '';
        continue;
      }
      const hidden = Math.abs(offY) >= 1.15 || Math.abs(offX) >= 1;
      el.style.visibility = hidden ? 'hidden' : '';
      el.style.opacity = '';
      el.style.zIndex = String(z);
      el.style.transform = `translate3d(${(offX * s.W).toFixed(1)}px, ${(offY * s.H).toFixed(1)}px, 0)`;
      // Parallax: the picture lags the card a little.
      if (media) media.style.transform = `translate3d(${(-offX * s.W * 0.32).toFixed(1)}px, ${(-offY * s.H * 0.3).toFixed(1)}px, 0) scale(${(1 + Math.min(0.06, Math.abs(offY) * 0.06)).toFixed(4)})`;
    }
  }, []);

  const cardRef = useCallback(
    (id: number, el: HTMLElement | null) => {
      if (el) {
        els.current.set(id, { el, media: el.querySelector<HTMLElement>('[data-media]') });
        layout();
      } else els.current.delete(id);
    },
    [layout],
  );

  useLayoutEffect(layout);

  // ---- settle: the card has landed ----
  const onSettled = useCallback(() => {
    const t = threadRef.current;
    const n = t.current;
    t.markSeen(n);
    setSettled(prev => (prev === n ? prev : n));
    const search = `?${t.search()}`;
    if (search !== lastSearch.current) {
      lastSearch.current = search;
      navigate({ search }, { replace: true, preventScrollReset: true });
    }
    // Preload the next two cards and the next way out, so swipes land on a loaded picture.
    const { right: r } = t.siblings();
    for (const p of [t.trail[t.cur + 1], t.trail[t.cur + 2], r]) {
      if (!p) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = cardImageUrl(t.d, p);
    }
  }, [navigate]);

  // ---- the spring loop ----
  const tick = useCallback(
    (time: number) => {
      const s = m.current;
      s.raf = 0;
      const red = reducedRef.current;
      // The spring takes small steps even when frames are late; the crossfade keeps to the clock.
      const now = Math.max(time, performance.now());
      const dt = s.last ? Math.min(red ? 0.5 : 0.05, (now - s.last) / 1000) : 0.016;
      s.last = now;
      let moving = false;
      if (s.drag?.axis !== 'y') {
        const r = springStep(s.vpos, s.vvel, s.vTarget, dt, red);
        s.vpos = r.x;
        s.vvel = r.v;
        moving ||= r.moving;
      }
      if (s.drag?.axis !== 'x') {
        const r = springStep(s.hoff, s.hvel, s.hTarget, dt, red);
        s.hoff = r.x;
        s.hvel = r.v;
        moving ||= r.moving;
      }
      if (s.hTarget !== 0 && Math.abs(s.hoff - s.hTarget) < 0.003) {
        // The way out beside the card has slid into place: it becomes the card.
        threadRef.current.branch(s.hTarget < 0 ? 1 : -1);
        s.hoff = s.hvel = s.hTarget = 0;
        rerender();
        moving = true;
      }
      layout();
      if (moving || s.drag) s.raf = requestAnimationFrame(tick);
      else {
        s.last = 0;
        onSettled();
      }
    },
    [layout, onSettled],
  );
  const kick = useCallback(() => {
    if (!m.current.raf) m.current.raf = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => {
    const s = m.current;
    return () => {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, []);

  // first landing (and after a restart)
  useEffect(() => {
    kick();
  }, [thread, kick]);

  // stage size
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      m.current.W = stage.clientWidth || 1;
      m.current.H = stage.clientHeight || 1;
      layout();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [layout]);

  // ---- moving through the feed ----
  const go = useCallback(
    (k: number, v0 = 0) => {
      const t = threadRef.current;
      const s = m.current;
      const target = Math.max(0, Math.min(k, t.trail.length - 1));
      // A jump along the trail shows as one card's slide, not a blur of every card between.
      if (Math.abs(target - t.cur) > 1) s.vpos = target + Math.sign(t.cur - target);
      t.go(target);
      s.vTarget = t.cur;
      s.vvel = reducedRef.current ? 0 : v0;
      setPlaying(null);
      rerender();
      kick();
    },
    [kick],
  );

  const branch = useCallback(
    (dir: 1 | -1) => {
      const t = threadRef.current;
      const s = m.current;
      if (t.current.alts.length < 2) {
        s.hvel = dir * -3;
        kick();
        return;
      }
      setPlaying(null);
      s.hTarget = dir > 0 ? -1 : 1;
      kick();
    },
    [kick],
  );

  const hopTo = useCallback(
    (hop: Hop) => {
      const t = threadRef.current;
      t.setNext(hop);
      setSheetOpen(false);
      go(t.cur + 1);
    },
    [go],
  );

  const showToast = useCallback((msg: string) => setToast(msg), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}${THREAD_PATH}?${threadRef.current.search()}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link to this trail copied');
    } catch {
      showToast('Copy failed: the address bar has the link');
    }
  }, [showToast]);

  const toggleSound = useCallback(() => {
    setPlaying(null);
    setSound(s => {
      showToast(s ? 'Muted' : 'Sound on');
      return !s;
    });
  }, [showToast]);

  const openDetails = useCallback(() => {
    if (!wide) setSheetOpen(true);
  }, [wide]);
  const closeDetails = useCallback(() => {
    setSheetOpen(false);
    setPlaying(null);
    stageRef.current?.focus({ preventScroll: true });
  }, []);

  // ---- pointer, wheel, keys ----
  const tap = (target: EventTarget | null) => {
    const act = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'branch') return branch(1);
    if (act === 'sound') return toggleSound();
    if (wide) {
      if (threadRef.current.current.view === 'video') toggleSound();
      return;
    }
    openDetails();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const now = performance.now();
    m.current.drag = { x: e.clientX, y: e.clientY, t: now, axis: null, v0: m.current.vpos, samples: [[e.clientX, e.clientY, now]], target: e.target };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = m.current;
    const dg = s.drag;
    if (!dg) return;
    const dx = e.clientX - dg.x;
    const dy = e.clientY - dg.y;
    dg.samples.push([e.clientX, e.clientY, performance.now()]);
    if (dg.samples.length > 6) dg.samples.shift();
    if (!dg.axis) {
      dg.axis = dragAxis(dx, dy);
      if (dg.axis) {
        stageRef.current?.classList.add('is-dragging');
        if (dg.axis === 'x') setPlaying(null);
      }
    }
    if (!dg.axis || reducedRef.current) return;
    const t = threadRef.current;
    if (dg.axis === 'y') s.vpos = rubberBand(dg.v0 - dy / s.H, 0, t.trail.length - 1);
    else s.hoff = Math.max(-1, Math.min(1, (dx / s.W) * (t.current.alts.length > 1 ? 1 : 0.25)));
    kick();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = m.current;
    const dg = s.drag;
    if (!dg) return;
    s.drag = null;
    stageRef.current?.classList.remove('is-dragging');
    const a = dg.samples[0];
    const b = dg.samples[dg.samples.length - 1];
    const dt = Math.max(1, b[2] - a[2]);
    const vx = (b[0] - a[0]) / dt;
    const vy = (b[1] - a[1]) / dt;
    if (!dg.axis) {
      if (e.type === 'pointerup' && performance.now() - dg.t < 450) tap(dg.target);
      return;
    }
    const t = threadRef.current;
    if (dg.axis === 'y') {
      const dir = swipeDirection(e.clientY - dg.y, vy, s.H, 'y');
      go(t.cur + dir, (-vy * 1000) / s.H);
    } else {
      const dir = swipeDirection(e.clientX - dg.x, vx, s.W, 'x');
      if (dir) branch(dir);
      else {
        s.hTarget = 0;
        kick();
      }
    }
  };

  // Wheel: one hop per gesture, sideways scroll branches.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let acc = 0;
    let accX = 0;
    let locked = false;
    let timer = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        locked = false;
        acc = accX = 0;
      }, 160);
      if (locked) return;
      acc += e.deltaY;
      accX += e.deltaX;
      const t = threadRef.current;
      if (Math.abs(accX) > 60 && Math.abs(accX) > Math.abs(acc)) {
        branch(accX > 0 ? 1 : -1);
        locked = true;
      } else if (Math.abs(acc) > 40) {
        go(t.cur + (acc > 0 ? 1 : -1));
        locked = true;
      }
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      stage.removeEventListener('wheel', onWheel);
      window.clearTimeout(timer);
    };
  }, [go, branch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      if (isTyping(active)) return;
      if (e.key === 'Escape' && sheetOpen) {
        closeDetails();
        e.preventDefault();
        return;
      }
      // Keys belong to the feed when focus is on the page itself or the feed and trail, not in the details.
      const page = pageRef.current;
      const inFeed = active === document.body || active === stageRef.current || (!!page && page.contains(active) && !active?.closest('.thr-panel, .thr-sheet'));
      if (!inFeed || sheetOpen) return;
      const t = threadRef.current;
      const onButton = !!active?.closest('button, a');
      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
        case 'j':
          go(t.cur + 1);
          break;
        case ' ':
          if (onButton) return;
          go(t.cur + (e.shiftKey ? -1 : 1));
          break;
        case 'ArrowUp':
        case 'PageUp':
        case 'k':
          go(t.cur - 1);
          break;
        case 'ArrowRight':
        case 'l':
          branch(1);
          break;
        case 'ArrowLeft':
        case 'h':
          branch(-1);
          break;
        case 'Enter':
          if (onButton) return;
          openDetails();
          break;
        case 'c':
          void copyLink();
          break;
        case 'm':
          toggleSound();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, branch, openDetails, closeDetails, copyLink, toggleSound, sheetOpen]);

  // Keyboard activation of the buttons inside cards (pointer taps go through tap()).
  const onStageClick = (e: React.MouseEvent) => {
    if (e.detail !== 0) return;
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'branch') branch(1);
    if (act === 'sound') toggleSound();
  };

  useEffect(() => {
    if (wide) setSheetOpen(false);
  }, [wide]);

  // ---- page colour and title ----
  const palette = useMemo(() => cardPalette(d, settled), [d, settled]);
  usePageFlood(palette.flood, palette.ink, { cover: palette.cover, ground: palette.ground });
  const settledName = entityName(d, settled);
  usePageTitle(`${settledName} | The Thread | Russ.fm`);

  const current = thread.current;
  const outs = current.outs ?? thread.computeOuts(thread.cur);
  const nextAlt = thread.trail[thread.cur + 1]?.alt ?? null;
  const details = (
    <ThreadDetails
      d={d}
      node={current}
      outs={outs}
      nextAlt={nextAlt}
      sound={sound}
      playing={playing}
      various={thread.ix.various}
      onHop={hopTo}
      onPick={(kind, i) => hopTo(thread.connectFromCurrent(kind, i))}
      onPlay={setPlaying}
      onSound={toggleSound}
      onCopy={() => void copyLink()}
    />
  );

  return (
    <div ref={pageRef} className="thr-page">
      <ThreadTrail d={d} nodes={thread.trail.slice(0, thread.maxSeen + 1)} cur={thread.cur} vertical={wide} onJump={go} onCopy={() => void copyLink()} />

      <div
        ref={stageRef}
        className="thr-stage"
        tabIndex={0}
        role="region"
        aria-roledescription="feed"
        aria-label="The Thread. Arrow keys or swipe: up and down to hop, left and right for another way out, Enter for details."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onStageClick}
      >
        {placed.map(p => (
          <ThreadCard
            key={p.node.id}
            d={d}
            node={p.node}
            k={p.k}
            nextText={p.side === 0 ? (thread.trail[p.k + 1]?.via.text ?? null) : null}
            playing={p.side === 0 && p.node === current && p.node === settled && !playing && (!reduced || sound)}
            sound={sound}
            hint={p.k < 2}
            cardRef={cardRef}
          />
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {settled.via.type === 'seed' ? `Start: ${settledName}` : `${settledName}. ${settled.via.text}`}
      </p>

      {wide ? (
        <aside className="thr-panel" aria-label="Details">
          {details}
        </aside>
      ) : (
        <ThreadSheet open={sheetOpen} onClose={closeDetails} label={`Details: ${entityName(d, current)}`}>
          {details}
        </ThreadSheet>
      )}

      <div className={`thr-toast${toast ? ' is-on' : ''}`} role="status">
        {toast}
      </div>
    </div>
  );
}
