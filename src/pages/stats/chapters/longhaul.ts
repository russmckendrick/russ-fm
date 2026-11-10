// 07 · The long haul: the most collected artists, a lane each across every year, a dot per record on the day it arrived.
import * as d3 from 'd3';
import { esc, head, plural } from '../../wrapped/story/core';
import type { StatsArtist, StatsRecord } from '@/types/stats';
import { fallback, onWidthChange, recordTip, tooltip, type StatsChapter, type StatsView } from '../kit';

const TOP = 16;
interface Lane { a: StatsArtist; recs: StatsRecord[] }
interface Dot { r: StatsRecord; k: number }

export default function longhaul(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let current: StatsView | null = null;
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    current = v;
    tip.hide();
    const lanes: Lane[] = v.artists.slice(0, TOP).map(a => ({ a, recs: v.records.filter(r => r.a.includes(a.s)) })).filter(l => l.recs.length);
    if (!lanes.length) { el.innerHTML = ''; return; }
    const span = (l: Lane) => (Date.parse(l.recs.at(-1)!.d) - Date.parse(l.recs[0].d)) / 3.156e10;
    const longest = lanes.reduce((a, b) => (span(b) > span(a) ? b : a));
    const best = lanes.map(l => ({ l, y: d3.greatest(d3.rollups(l.recs, x => x.length, r => r.d.slice(0, 4)), d => d[1])! }))
      .reduce((a, b) => (b.y[1] > a.y[1] ? b : a));
    const years = Object.keys(v.perYear).map(Number);
    const everyYear = lanes.filter(l => new Set(l.recs.map(r => r.d.slice(0, 4))).size === years.length);

    el.innerHTML = `<div class="wrap">
      ${head('07', 'The long haul', 'Who keeps coming back', `The ${lanes.length} most collected artists, each on its own line. Every dot is a record, in its sleeve colour, on the day it arrived.`)}
      <div class="stats st-stats">
        <div class="stat"><b>${esc(longest.a.name)}</b><span>the longest run: ${span(longest).toFixed(1)} years from first record to latest</span></div>
        <div class="stat"><b>${esc(best.l.a.name)}</b><span>${plural(best.y[1], 'record')} in ${best.y[0]} alone, the most in one year</span></div>
        <div class="stat"><b>${everyYear.length}</b><span>${everyYear.length === 1 ? 'artist' : 'artists'} added in every single year${everyYear.length ? `: ${everyYear.map(l => esc(l.a.name)).join(', ')}` : ''}</span></div>
      </div>
      <div class="lh-chart"></div>
    </div>`;

    const box = el.querySelector<HTMLElement>('.lh-chart')!;
    const W = box.clientWidth, narrow = W < 640, lab = narrow ? 112 : 220, rowH = narrow ? 32 : 40, H = lanes.length * rowH + 30;
    const x = d3.scaleTime([Date.parse(v.records[0].d), Date.parse(v.records.at(-1)!.d)], [lab + 14, W - 10]);
    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', `The ${lanes.length} most collected artists and when each of their records arrived`);
    const jan = (y: number) => x(Date.UTC(y, 0, 1));
    const ticks = svg.append('g').selectAll('g').data(years.filter(y => jan(y) > lab)).join('g');
    ticks.append('line').attr('class', 'lh-tick').attr('x1', jan).attr('x2', jan).attr('y2', H - 22);
    ticks.append('text').attr('class', 'lh-yr').attr('x', y => jan(y) + 4).attr('y', H - 6).text(y => (W < 900 ? `’${String(y).slice(2)}` : String(y)));
    const rows = svg.append('g').selectAll('g').data(lanes).join('g').attr('transform', (_, i) => `translate(0,${i * rowH + rowH / 2})`);
    rows.append('line').attr('class', 'lh-lane').attr('x1', l => x(Date.parse(l.recs[0].d))).attr('x2', l => x(Date.parse(l.recs.at(-1)!.d)));
    const names = rows.append('a').attr('href', l => `/artist/${l.a.s}/`).append('text').attr('class', 'lh-name').attr('x', lab).attr('dy', '0.35em').attr('text-anchor', 'end');
    names.append('tspan').text(l => l.a.name);
    names.append('tspan').attr('class', 'lh-count').attr('dx', 8).text(l => l.recs.length);
    rows.selectAll<SVGCircleElement, Dot>('circle').data(l => l.recs.map((r, k) => ({ r, k }))).join('circle')
      .attr('class', 'lh-dot').attr('cx', d => x(Date.parse(d.r.d))).attr('cy', d => ((d.k % 3) - 1) * 4)
      .attr('r', narrow ? 4 : 6).attr('fill', d => d.r.f ?? fallback)
      .on('pointermove', (e: PointerEvent, d) => tip.show(e, () => recordTip(v, d.r, `added ${new Date(d.r.d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`), d))
      .on('pointerleave', () => tip.hide());
  }

  return { render, dispose: () => { unwatch(); tip.remove(); } };
}
