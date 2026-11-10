// What the /stats chapters share. Each chapter is chapters/<id>.ts: a factory that takes its
// <section> and returns { render(view), dispose() }, like the Wrapped story's chapters, whose
// helpers (head, countUp, onVisible…) and styles (.ws, story.css) it reuses.
import * as d3 from 'd3';
import { getAlbumImageUrl, getArtistAvatarUrl } from '@/lib/image-utils';
import type { StatsArtist, StatsData, StatsRecord } from '@/types/stats';
import { clamp, esc, reduced } from '../wrapped/story/core';

export interface StatsView extends StatsData {
  /** Medium sleeve URL for an album slug */
  img: (s: string) => string;
  avatar: (s: string) => string;
  bySlug: Map<string, StatsRecord>;
  artistBySlug: Map<string, StatsArtist>;
  famColour: Record<string, string>;
  famName: Record<string, string>;
}
export interface StatsChapter {
  render(view: StatsView): void;
  dispose(): void;
}
export type StatsChapterFactory = (el: HTMLElement) => StatsChapter;

export function statsView(d: StatsData): StatsView {
  return {
    ...d,
    img: s => getAlbumImageUrl(s, 'medium'),
    avatar: getArtistAvatarUrl,
    bySlug: new Map(d.records.map(r => [r.s, r])),
    artistBySlug: new Map(d.artists.map(a => [a.s, a])),
    famColour: Object.fromEntries(d.families.map(f => [f.key, f.colour])),
    famName: Object.fromEntries(d.families.map(f => [f.key, f.name])),
  };
}

export const n = (v: number) => v.toLocaleString('en-GB');
/** 11,407,801,978 → "11.4 bn"; 189,582,658 → "190M". */
export const big = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} bn` : v >= 1e6 ? `${Math.round(v / 1e6)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : n(v));
export const fallback = '#e9a23b';

/** A row of sleeves linking to their albums (credits strips, tooltips). */
export const strip = (v: StatsView, slugs: string[], cls = 'cr-strip') =>
  `<div class="${cls}">${slugs.map(s => `<a href="/album/${s}/" title="${esc(v.bySlug.get(s)?.t ?? '')}"><img src="${v.img(s)}" alt="" loading="lazy"></a>`).join('')}</div>`;

/** A record's tooltip: title, artist, a line of detail and the sleeve. */
export const recordTip = (v: StatsView, r: StatsRecord, line: string) =>
  `<b>${esc(r.t)}</b>${esc(r.by)}<br>${line}<div class="thumbs"><img src="${v.img(r.s)}" alt=""></div>`;

/**
 * A chart tooltip on <body> (.ws-tip, story.css), created on first use. Pass `html` as a
 * function and a `key` (the hovered item) and a pointer moving over the same item only
 * moves the tip: no new markup, no layout read.
 */
export function tooltip() {
  let tip: HTMLDivElement | null = null;
  let key: unknown, w = 0, h = 0;
  return {
    show(e: { clientX: number; clientY: number }, html: string | (() => string), k?: unknown) {
      if (!tip) { tip = Object.assign(document.createElement('div'), { className: 'ws-tip st-tip' }); document.body.append(tip); }
      if (k === undefined || k !== key) {
        key = k;
        tip.innerHTML = typeof html === 'function' ? html() : html;
        w = tip.offsetWidth; h = tip.offsetHeight;
        tip.classList.add('on');
      }
      tip.style.left = `${Math.min(innerWidth - w - 8, e.clientX + 16)}px`;
      tip.style.top = `${Math.min(innerHeight - h - 8, e.clientY + 16)}px`;
    },
    hide() { tip?.classList.remove('on'); key = undefined; },
    remove() { tip?.remove(); tip = null; key = undefined; },
  };
}

/**
 * Call `cb` once el's width has settled (150 ms after the last change) and moved by more than
 * 40px; charts are drawn to a measured width, so a window drag redraws once, not per frame.
 */
export function onWidthChange(el: HTMLElement, cb: () => void) {
  let w = el.clientWidth, timer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (Math.abs(el.clientWidth - w) > 40) { w = el.clientWidth; cb(); }
    }, 150);
  });
  ro.observe(el);
  return () => { ro.disconnect(); clearTimeout(timer); };
}

export interface SwarmItem { r: StatsRecord; x: number }

/**
 * Lay dots of radius r along x without overlaps, each as close to the axis as it can get
 * ("dodge"): walk them in x order and, for each, merge the y-ranges its already placed
 * neighbours rule out and take the free edge nearest 0. Deterministic and O(n·k log k),
 * a few ms for thousands of dots where a force simulation took over a second.
 */
export function dodge(xs: number[], r: number): number[] {
  const D = 2 * r + 0.8, D2 = D * D;
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const ys = new Array<number>(xs.length).fill(0);
  const placed: number[] = [];
  let lo = 0;
  const iv: Array<[number, number]> = [];
  for (const i of order) {
    const x = xs[i];
    while (lo < placed.length && x - xs[placed[lo]] >= D) lo++;
    iv.length = 0;
    for (let k = lo; k < placed.length; k++) {
      const j = placed[k], dx = x - xs[j], dy = Math.sqrt(D2 - dx * dx);
      iv.push([ys[j] - dy, ys[j] + dy]);
    }
    let y = 0;
    if (iv.length) {
      iv.sort((a, b) => a[0] - b[0]);
      // Merge into disjoint ranges; the edges of merged ranges are free spots.
      let a = iv[0][0], b = iv[0][1];
      for (let k = 1; k <= iv.length; k++) {
        if (k < iv.length && iv[k][0] < b) { b = Math.max(b, iv[k][1]); continue; }
        if (a < 0 && b > 0) { y = -a < b ? a : b; break; }
        if (k < iv.length) { a = iv[k][0]; b = iv[k][1]; }
      }
    }
    ys[i] = y;
    placed.push(i);
  }
  return ys;
}

/**
 * A beeswarm of sleeve-coloured dots along x (decades). The layout is
 * dodge()'d up front; the `bg` svg group takes the caller's bands and axis and the dots go on
 * a canvas above it (thousands of SVG circles were the page's heaviest paint), with hover
 * found through a quadtree. `play()` lifts the dots from the axis into place, once.
 */
export function swarm(box: HTMLElement, items: SwarmItem[], { r, pad = 20, tip }: { r: number; pad?: number; tip: (e: PointerEvent, it: SwarmItem) => void }) {
  const W = box.clientWidth;
  const xs = items.map(it => clamp(it.x, r + 2, W - r - 2));
  const ys = dodge(xs, r);
  const half = (d3.max(ys, y => Math.abs(y)) ?? 0) + r + 8, H = Math.round(half * 2 + pad * 2), mid = half + pad;

  const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const bg = svg.append('g');
  const canvas = Object.assign(document.createElement('canvas'), { className: 'sw-canvas' });
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  box.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const ink = getComputedStyle(box).getPropertyValue('--ink').trim() || '#fbf7ef';
  const fills = items.map(it => it.r.f ?? fallback);
  const tree = d3.quadtree<number>().x(i => xs[i]).y(i => ys[i] + mid).addAll(items.map((_, i) => i));

  let k = reduced() ? 1 : 0, hover = -1, raf = 0;
  // Each dot rises from the axis; the ones furthest out start a little later.
  const at = (i: number) => (k >= 1 ? ys[i] : ys[i] * d3.easeCubicOut(clamp((k * 1.4) - (Math.abs(ys[i]) / half) * 0.4, 0, 1)));
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(14,13,12,.6)';
    for (let i = 0; i < xs.length; i++) {
      ctx.beginPath(); ctx.arc(xs[i], at(i) + mid, r, 0, 2 * Math.PI);
      ctx.fillStyle = fills[i]; ctx.fill(); ctx.stroke();
    }
    if (hover >= 0 && k >= 1) {
      ctx.beginPath(); ctx.arc(xs[hover], ys[hover] + mid, r + 0.5, 0, 2 * Math.PI);
      ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke();
    }
  };
  draw();

  const onMove = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    const i = tree.find(e.clientX - b.left, e.clientY - b.top, r + 3) ?? -1;
    canvas.style.cursor = i >= 0 ? 'pointer' : '';
    if (i !== hover) { hover = i; if (k >= 1) draw(); }
    if (i >= 0) tip(e, items[i]);
  };
  const onLeave = () => { if (hover >= 0) { hover = -1; if (k >= 1) draw(); } };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

  return {
    svg, bg, canvas, W, H,
    play() {
      if (k >= 1) return;
      const t0 = performance.now();
      const step = (now: number) => {
        k = Math.min(1, (now - t0) / 1400);
        draw();
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
    stop() { cancelAnimationFrame(raf); },
  };
}
