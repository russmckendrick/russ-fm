// The long haul: the most collected acts, a lane each. A line runs from the year the act
// started (TheAudioDB's formed year) to the day their first record arrived here, then every
// record since is a dot in its sleeve colour. The axis is in two parts: decades before the
// collection began, squeezed into the left of the chart, and the collection's own years after.
import * as d3 from 'd3';
import { countUp, esc, head, onVisible, plural } from '../../wrapped/story/core';
import type { StatsArtist, StatsRecord } from '@/types/stats';
import { fallback, n, onWidthChange, recordTip, tooltip, type StatsChapter, type StatsView } from '../kit';

const TOP = 20;
interface Lane { a: StatsArtist; recs: StatsRecord[] }
interface Dot { r: StatsRecord; k: number }
/** A date as a fractional year. */
const frac = (d: string) => +d.slice(0, 4) + (+d.slice(5, 7) - 1) / 12 + (+d.slice(8, 10) - 1) / 365;

export default function artists(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    cleanup();
    current = v;
    const lanes: Lane[] = v.artists.slice(0, TOP).map(a => ({ a, recs: v.records.filter(r => r.a.includes(a.s)) })).filter(l => l.recs.length);
    if (!lanes.length) { el.innerHTML = ''; return; }
    const started = v.artists.filter(a => a.formed && a.formed <= frac(a.first));
    const gap = d3.median(started, a => frac(a.first) - a.formed!);
    const best = lanes.map(l => ({ l, y: d3.greatest(d3.rollups(l.recs, x => x.length, r => r.d.slice(0, 4)), d => d[1])! }))
      .reduce((a, b) => (b.y[1] > a.y[1] ? b : a));
    const years = Object.keys(v.perYear).map(Number);
    const everyYear = lanes.filter(l => new Set(l.recs.map(r => r.d.slice(0, 4))).size === years.length);
    // An act can be both split and dead (a solo artist, say); count each once, deaths first.
    const died = v.artists.filter(a => a.died).length, gone = v.artists.filter(a => a.split || a.died).length;

    el.innerHTML = `<div class="wrap">
      ${head('', 'The long haul', 'Late, then loyal', `The ${lanes.length} most collected acts. Each line runs from the year the act started to the day their first record arrived; every dot after that is a record, in its sleeve colour. A cross marks a death.`)}
      <div class="stats st-stats">
        ${gap ? `<div class="stat"><b data-n="${Math.round(gap)}">0</b><span>years, typically, between an act starting out and their first record arriving here</span></div>` : ''}
        <div class="stat"><b>${esc(best.l.a.name)}</b><span>${plural(best.y[1], 'record')} in ${best.y[0]} alone, the most in one year</span></div>
        <div class="stat"><b data-n="${everyYear.length}">0</b><span>${everyYear.length === 1 ? 'act' : 'acts'} added in every single year${everyYear.length ? `: ${everyYear.map(l => esc(l.a.name)).join(', ')}` : ''}</span></div>
        <div class="stat"><b data-n="${gone}">0</b><span>acts no longer going: ${n(died)} have died, another ${n(gone - died)} split up</span></div>
      </div>
      <div class="lh-chart"></div>
      <p class="ar-foot">Start years from TheAudioDB, which has one for ${plural(started.length, 'act')} of ${n(v.artists.length)}.</p>
    </div>`;

    const box = el.querySelector<HTMLElement>('.lh-chart')!;
    const W = box.clientWidth, narrow = W < 640, lab = narrow ? 112 : 220, rowH = narrow ? 30 : 36, H = lanes.length * rowH + 30;
    const begin = frac(v.records[0].d), end = frac(v.records.at(-1)!.d) + 0.1;
    const formed = lanes.map(l => l.a.formed).filter((y): y is number => !!y && y < begin);
    const lo = formed.length ? Math.floor(d3.min(formed)! / 10) * 10 : begin;
    // The break: the years before the collection take the left third (a quarter on a phone).
    const left = lab + 14, brk = formed.length ? left + (W - left) * (narrow ? 0.25 : 0.34) : left;
    const x = d3.scaleLinear([lo, begin, end], [left, brk, W - 10]).clamp(true);
    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', `The ${lanes.length} most collected acts: when each started and when each of their records arrived`);

    svg.append('rect').attr('class', 'lh-before').attr('x', left).attr('width', brk - left).attr('height', H - 22);
    const ticks = [...d3.range(Math.ceil(lo / 10) * 10, begin - 4, narrow ? 20 : 10), ...years.filter(y => y > begin)];
    const tick = svg.append('g').selectAll('g').data(ticks).join('g');
    tick.append('line').attr('class', 'lh-tick').attr('x1', x).attr('x2', x).attr('y2', H - 22);
    tick.append('text').attr('class', 'lh-yr').attr('x', y => x(y) + 4).attr('y', H - 6)
      .text(y => (y < begin ? (narrow ? `’${String(y).slice(2)}` : `${y}s`) : W < 900 ? `’${String(y).slice(2)}` : String(y)));

    const rows = svg.append('g').selectAll('g').data(lanes).join('g').attr('class', 'ar-row').attr('transform', (_, i) => `translate(0,${i * rowH + rowH / 2})`);
    const names = rows.append('a').attr('href', l => `/artist/${l.a.s}/`).append('text').attr('class', 'lh-name').attr('x', lab).attr('dy', '0.35em').attr('text-anchor', 'end');
    names.append('tspan').text(l => l.a.name);
    names.append('tspan').attr('class', 'lh-count').attr('dx', 8).text(l => l.recs.length);
    rows.append('line').attr('class', 'lh-lane').attr('x1', l => x(frac(l.recs[0].d))).attr('x2', l => x(frac(l.recs.at(-1)!.d)));
    const known = rows.filter(l => !!l.a.formed && l.a.formed <= frac(l.a.first));
    const span = known.append('line').attr('class', 'ar-span').attr('x1', l => x(l.a.formed!)).attr('x2', l => x(l.a.formed!)).attr('stroke', l => l.a.f ?? fallback);
    known.append('circle').attr('class', 'ar-start').attr('cx', l => x(l.a.formed!)).attr('r', 4)
      .on('pointermove', (e: PointerEvent, l) => tip.show(e, () => `<b>${esc(l.a.name)}</b>Started ${l.a.formed}${l.a.born ? ` (born ${l.a.born})` : ''} · first record here ${new Date(l.a.first).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}<br>${plural(l.a.n, 'record')} on the shelves${l.a.died ? ` · died ${l.a.died}` : l.a.split ? ' · split up' : ''}<div class="thumbs"><img src="${v.avatar(l.a.s)}" alt=""></div>`, l))
      .on('pointerleave', () => tip.hide());
    rows.filter(l => !!l.a.died).append('text').attr('class', 'ar-died').attr('x', l => x(l.a.died!)).attr('dy', '-0.55em').attr('text-anchor', 'middle').text('✕');
    rows.selectAll<SVGCircleElement, Dot>('.lh-dot').data(l => l.recs.map((r, k) => ({ r, k }))).join('circle')
      .attr('class', 'lh-dot').attr('cx', d => x(frac(d.r.d))).attr('cy', d => ((d.k % 3) - 1) * 4)
      .attr('r', narrow ? 4 : 6).attr('fill', d => d.r.f ?? fallback)
      .on('pointermove', (e: PointerEvent, d) => tip.show(e, () => recordTip(v, d.r, `added ${new Date(d.r.d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`), d))
      .on('pointerleave', () => tip.hide());

    const io = onVisible(box, () => {
      // Each line runs out from the start year to the first record.
      span.transition().duration(1200).delay((_, i) => i * 30).attr('x2', l => x(frac(l.a.first)));
      el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!));
    }, { threshold: 0.1 });
    stops.push(() => { io.disconnect(); span.interrupt(); tip.hide(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
