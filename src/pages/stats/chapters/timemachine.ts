// 07 · Time machines: an arc from the year each record first came out to the year this
// pressing was made, so the reissues sweep across the decades and the new records sit flat.
import * as d3 from 'd3';
import { countUp, esc, head, onVisible, reduced } from '../../wrapped/story/core';
import type { StatsRecord } from '@/types/stats';
import { fallback, onWidthChange, recordTip, tooltip, type StatsChapter, type StatsView } from '../kit';

type Pressed = StatsRecord & { y: number; p: number };

export default function timemachine(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    cleanup();
    current = v;
    // A pressing year before the original is a data slip; leave it out.
    const pressed = v.records.filter((r): r is Pressed => !!r.y && !!r.p && r.p >= r.y);
    if (!pressed.length) { el.innerHTML = ''; return; }
    const same = pressed.filter(r => r.p - r.y <= 1).length;
    const reissues = pressed.filter(r => r.p - r.y >= 10).sort((a, b) => (b.p - b.y) - (a.p - a.y));
    const widest = reissues[0];

    el.innerHTML = `<div class="wrap">
      ${head('07', 'Time machines', 'New pressings of old records', `Each arc runs from the year a record first came out to the year this copy was pressed. Records bought new barely leave the line.`)}
      <div class="stats st-stats">
        <div class="stat"><b data-n="${same}">0</b><span>pressed within a year of first coming out</span></div>
        <div class="stat"><b data-n="${reissues.length}">0</b><span>pressed ten or more years later</span></div>
        ${widest ? `<div class="stat"><b data-n="${widest.p - widest.y}">0</b><span>years between ${esc(widest.t)} coming out and this pressing, the widest gap</span></div>` : ''}
      </div>
      <div class="tm-chart"></div>
    </div>`;

    const box = el.querySelector<HTMLElement>('.tm-chart')!;
    const W = box.clientWidth, H = Math.round(Math.min(440, Math.max(260, W * 0.34))), base = H - 28;
    const lo = Math.floor(d3.min(pressed, r => r.y)! / 10) * 10, hi = d3.max(pressed, r => r.p)! + 1;
    const x = d3.scaleLinear([lo, hi], [12, W - 12]);
    const tall = d3.scaleLinear([0, hi - lo], [0, base - 12]);
    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', 'Arcs from each record\'s original year to its pressing year');
    const decades = d3.range(lo, hi, 10);
    svg.append('g').selectAll('text').data(decades).join('text').attr('class', 'lh-yr').attr('x', d => x(d) + 4).attr('y', H - 6).text(d => (W < 640 ? `’${String(d).slice(2)}` : `${d}s`));
    svg.append('line').attr('class', 'tm-base').attr('x1', 0).attr('x2', W).attr('y1', base).attr('y2', base);
    const arc = (r: Pressed) => {
      const a = x(r.y), b = x(Math.max(r.p, r.y + 0.3)), h = tall(r.p - r.y);
      return `M${a},${base} C${a},${base - h * 1.33} ${b},${base - h * 1.33} ${b},${base}`;
    };
    // Widest arcs first so the short ones draw over them.
    const paths = svg.append('g').selectAll('path').data([...pressed].sort((a, b) => (b.p - b.y) - (a.p - a.y))).join('path')
      .attr('class', 'tm-arc').attr('d', arc).attr('stroke', r => r.f ?? fallback)
      .on('pointermove', (e: PointerEvent, r) => tip.show(e, recordTip(v, r, `First out ${r.y} · this pressing ${r.p}${r.p - r.y >= 1 ? ` · <span style="color:var(--amber)">${r.p - r.y} years on</span>` : ''}`)))
      .on('pointerleave', () => tip.hide());
    // pathLength=1 lets every arc draw in without measuring each one.
    if (!reduced()) paths.attr('pathLength', 1).attr('stroke-dasharray', '1 1').attr('stroke-dashoffset', 1);

    const io = onVisible(box, () => {
      if (!reduced()) paths.transition().duration(1600).delay((_, i) => (i / pressed.length) * 900).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0);
      el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!));
    }, { threshold: 0.2 });
    stops.push(() => { io.disconnect(); paths.interrupt(); tip.hide(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
