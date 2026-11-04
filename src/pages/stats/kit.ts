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

/** A chart tooltip on <body> (.ws-tip, story.css), created on first use. */
export function tooltip() {
  let tip: HTMLDivElement | null = null;
  return {
    show(e: { clientX: number; clientY: number }, html: string) {
      if (!tip) { tip = Object.assign(document.createElement('div'), { className: 'ws-tip' }); document.body.append(tip); }
      tip.innerHTML = html;
      tip.classList.add('on');
      tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 16)}px`;
      tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 16)}px`;
    },
    hide() { tip?.classList.remove('on'); },
    remove() { tip?.remove(); tip = null; },
  };
}

/** Call `cb` when el's width changes by more than 40px (charts are drawn to a measured width). */
export function onWidthChange(el: HTMLElement, cb: () => void) {
  let w = el.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - w) > 40) { w = el.clientWidth; cb(); }
  });
  ro.observe(el);
  return () => ro.disconnect();
}

export interface SwarmItem { r: StatsRecord; x: number }
interface Node extends d3.SimulationNodeDatum { item: SwarmItem; t: number }

/**
 * A beeswarm of sleeve-coloured dots along x (decades, Last.fm reach). Settles off-screen to
 * size the field, draws the `bg` group for the caller's bands and axis, then replays the swarm
 * live from the axis when `play()` is called. Returns the svg, its height and a stop.
 */
export function swarm(box: HTMLElement, items: SwarmItem[], { r, pad = 20, tip }: { r: number; pad?: number; tip: (e: PointerEvent, it: SwarmItem) => void }) {
  const W = box.clientWidth;
  const jitter = d3.randomLcg(0.42);
  const nodes: Node[] = items.map(item => ({ item, t: item.x, x: item.x, y: (jitter() - 0.5) * 20 }));
  const forces = (s: d3.Simulation<Node, undefined>) => s.force('x', d3.forceX<Node>(d => d.t).strength(0.5)).force('y', d3.forceY<Node>(0).strength(0.03))
    .force('c', d3.forceCollide<Node>(r + 0.4).iterations(2)).force('in', () => nodes.forEach(d => { d.x = clamp(d.x!, r + 2, W - r - 2); }));
  const pre = forces(d3.forceSimulation(nodes)).stop();
  for (let i = 0; i < 220; i++) pre.tick();
  const half = (d3.max(nodes, d => Math.abs(d.y!)) ?? 0) + r + 8, H = Math.round(half * 2 + pad * 2);
  const end = nodes.map(d => [d.x!, d.y!] as const);

  const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const bg = svg.append('g');
  const dots = svg.append('g').attr('transform', `translate(0,${half + pad})`).selectAll('circle').data(nodes).join('circle')
    .attr('class', 'sw-dot').attr('r', r).attr('fill', d => d.item.r.f ?? fallback)
    .on('pointermove', (e: PointerEvent, d) => tip(e, d.item));
  const draw = () => dots.attr('cx', d => d.x!).attr('cy', d => d.y!);
  let sim: d3.Simulation<Node, undefined> | null = null;
  const settle = () => { nodes.forEach((d, i) => { [d.x, d.y] = end[i]; }); };
  if (reduced()) { settle(); draw(); } else { nodes.forEach(d => { d.x = d.t; d.y = (jitter() - 0.5) * 6; }); draw(); }

  return {
    svg, bg, dots, W, H,
    play() {
      if (reduced()) return;
      sim = forces(d3.forceSimulation(nodes)).alpha(1).alphaDecay(0.02).on('tick', draw)
        .on('end', () => { settle(); dots.transition().duration(600).attr('cx', d => d.x!).attr('cy', d => d.y!); });
    },
    stop() { sim?.stop(); dots.interrupt(); },
  };
}
