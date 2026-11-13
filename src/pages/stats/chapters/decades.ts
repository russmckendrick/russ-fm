// When it was made: every record placed by the year it first came out, a swarm of sleeve-coloured
// dots, and under it on the same axis an arc from that year to the year this copy was pressed,
// so the reissues sweep across the decades and the records bought new barely leave the line.
// The all-time take on Wrapped's decades chapter, which swarms sleeves; thousands of sleeves is too many here.
import * as d3 from 'd3';
import { countUp, esc, head, onVisible, plural, reduced } from '../../wrapped/story/core';
import type { StatsRecord } from '@/types/stats';
import { fallback, onWidthChange, recordTip, swarm, tooltip, type StatsChapter, type StatsView } from '../kit';

type Dated = StatsRecord & { y: number };
type Pressed = Dated & { p: number };
const arrived = (r: StatsRecord) => +r.d.slice(0, 4);

export default function decades(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    cleanup();
    current = v;
    const recs = v.records.filter((r): r is Dated => !!r.y && r.y > 1900);
    if (!recs.length) { el.innerHTML = ''; return; }
    const decs = d3.rollups(recs, x => x.length, r => Math.floor(r.y / 10) * 10);
    const top = decs.reduce((a, b) => (b[1] > a[1] ? b : a));
    const oldest = recs.reduce((a, b) => (b.y < a.y ? b : a));
    // A pressing year before the original is a data slip; leave it out. Widest arcs first so
    // the short ones draw over them.
    const pressed = recs.filter((r): r is Pressed => !!r.p && r.p >= r.y).sort((a, b) => (b.p - b.y) - (a.p - a.y));
    const same = pressed.filter(r => r.p - r.y <= 1).length;
    const reissues = pressed.filter(r => r.p - r.y >= 10).length;
    const widest = pressed[0];

    el.innerHTML = `<div class="wrap">
      ${head('', 'Decades', 'When it was made', `${plural(recs.length, 'record')}, each a dot at the year it first came out. The oldest, ${esc(oldest.t)}, goes back to ${oldest.y}. Underneath, an arc from that year to the year this copy was pressed.`)}
      <div class="stats st-stats">
        <div class="stat"><b data-n="${d3.median(recs, r => r.y)}" data-plain>0</b><span>the median original year</span></div>
        <div class="stat"><b>${top[0]}s</b><span>the decade with the most, ${plural(top[1], 'record')}</span></div>
        <div class="stat"><b data-n="${same}">0</b><span>pressed within a year of first coming out</span></div>
        <div class="stat"><b data-n="${reissues}">0</b><span>pressed ten or more years later${widest ? `; the widest gap is ${widest.p - widest.y} years, ${esc(widest.t)}` : ''}</span></div>
      </div>
      <div class="dc2-field"></div>
      ${pressed.length ? '<div class="tm-chart"></div>' : ''}
    </div>`;

    const box = el.querySelector<HTMLElement>('.dc2-field')!;
    const W = box.clientWidth, narrow = W < 640;
    const lo = Math.floor(d3.min(recs, d => d.y)! / 10) * 10, hi = new Date().getFullYear() + 3;
    const x = d3.scaleLinear([lo, hi], [8, W - 8]);
    // A seeded spread within each year, so the swarm settles the same way every time.
    const within = d3.randomLcg(0.7);
    const sw = swarm(box, recs.map(r => ({ r, x: x(r.y + within()) })), {
      r: narrow ? 2.2 : 3.4,
      tip: (e, it) => tip.show(e, () => recordTip(v, it.r, `<span style="color:var(--amber)">${it.r.y}</span> · ${arrived(it.r) - it.r.y!} years old when it arrived in ${arrived(it.r)}`), it),
    });
    sw.svg.attr('role', 'img').attr('aria-label', 'Every record by original release year');
    const bands = sw.bg.selectAll('g').data(d3.range(lo, hi, 10)).join('g');
    bands.append('rect').attr('class', (_, i) => `dc2-band${i % 2 ? ' odd' : ''}`).attr('x', d => x(d)).attr('width', d => x(Math.min(d + 10, hi)) - x(d)).attr('height', sw.H);
    bands.append('text').attr('class', 'dc2-lab').attr('x', d => x(d) + 8).attr('y', narrow ? 24 : 44).text(d => (x(d + 10) - x(d) > 110 ? `${d}s` : `’${String(d).slice(2)}`));
    box.addEventListener('pointerleave', () => tip.hide());

    // The arcs hang from the swarm's axis: same scale, so each falls from its dot's year.
    const arcBox = el.querySelector<HTMLElement>('.tm-chart');
    let sweep: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null;
    if (arcBox) {
      const H = Math.round(Math.min(320, Math.max(180, W * 0.24)));
      const tall = d3.scaleLinear([0, hi - lo], [0, H - 12]);
      const svg = d3.select(arcBox).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
        .attr('role', 'img').attr('aria-label', 'Arcs from each record\'s original year to its pressing year');
      svg.append('line').attr('class', 'tm-base').attr('x1', 0).attr('x2', W);
      const arc = (r: Pressed) => {
        const a = x(r.y), b = x(Math.max(r.p, r.y + 0.3)), h = tall(r.p - r.y);
        return `M${a},0 C${a},${h * 1.33} ${b},${h * 1.33} ${b},0`;
      };
      // One clip rect sweeps them in left to right: a single animated attribute, where a
      // transition per arc ran thousands at once.
      const clip = `tm-clip-${Math.random().toString(36).slice(2)}`;
      sweep = svg.append('clipPath').attr('id', clip).append('rect').attr('height', H * 2).attr('width', reduced() ? W : 0);
      svg.append('g').attr('clip-path', `url(#${clip})`).selectAll('path').data(pressed).join('path')
        .attr('class', 'tm-arc').attr('d', arc).attr('stroke', r => r.f ?? fallback)
        .on('pointermove', (e: PointerEvent, r) => tip.show(e, () => recordTip(v, r, `First out ${r.y} · this pressing ${r.p}${r.p - r.y >= 1 ? ` · <span style="color:var(--amber)">${r.p - r.y} years on</span>` : ''}`), r))
        .on('pointerleave', () => tip.hide());
    }

    const count = () => el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!, b.dataset.plain !== undefined ? { fmt: n => String(Math.round(n)) } : {}));
    const io = onVisible(box, () => {
      sw.play(); count();
      if (!reduced()) sweep?.transition().duration(2000).ease(d3.easeCubicInOut).attr('width', W);
    }, { threshold: 0.15 });
    stops.push(() => { io.disconnect(); sw.stop(); sweep?.interrupt(); tip.hide(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
