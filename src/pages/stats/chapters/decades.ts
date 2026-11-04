// 09 · Decades: every record placed by the year it first came out, a swarm of sleeve-coloured dots.
// The all-time take on Wrapped's decades chapter, which swarms sleeves; thousands of sleeves is too many here.
import * as d3 from 'd3';
import { countUp, esc, head, onVisible, plural } from '../../wrapped/story/core';
import type { StatsRecord } from '@/types/stats';
import { onWidthChange, recordTip, swarm, tooltip, type StatsChapter, type StatsView } from '../kit';

type Dated = StatsRecord & { y: number };
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

    el.innerHTML = `<div class="wrap">
      ${head('09', 'Decades', 'When it was made', `${plural(recs.length, 'record')}, each placed by the year it first came out. The oldest, ${esc(oldest.t)}, goes back to ${oldest.y}.`)}
      <div class="stats st-stats">
        <div class="stat"><b data-n="${d3.median(recs, r => r.y)}" data-plain>0</b><span>the median original year</span></div>
        <div class="stat"><b data-n="${Math.round(d3.mean(recs, r => arrived(r) - r.y)!)}">0</b><span>years old, on average, when it arrived</span></div>
        <div class="stat"><b>${top[0]}s</b><span>the decade with the most, ${plural(top[1], 'record')}</span></div>
        <div class="stat"><b data-n="${recs.filter(r => r.y === arrived(r)).length}">0</b><span>bought the year they came out</span></div>
      </div>
      <div class="dc2-field"></div>
    </div>`;

    const box = el.querySelector<HTMLElement>('.dc2-field')!;
    const W = box.clientWidth, narrow = W < 640;
    const lo = Math.floor(d3.min(recs, d => d.y)! / 10) * 10, hi = new Date().getFullYear() + 3;
    const x = d3.scaleLinear([lo, hi], [8, W - 8]);
    // A seeded spread within each year, so the swarm settles the same way every time.
    const within = d3.randomLcg(0.7);
    const sw = swarm(box, recs.map(r => ({ r, x: x(r.y + within()) })), {
      r: narrow ? 2.2 : 3.4,
      tip: (e, it) => tip.show(e, recordTip(v, it.r, `<span style="color:var(--amber)">${it.r.y}</span> · ${arrived(it.r) - it.r.y!} years old when it arrived in ${arrived(it.r)}`)),
    });
    sw.svg.attr('role', 'img').attr('aria-label', 'Every record by original release year');
    const bands = sw.bg.selectAll('g').data(d3.range(lo, hi, 10)).join('g');
    bands.append('rect').attr('class', (_, i) => `dc2-band${i % 2 ? ' odd' : ''}`).attr('x', d => x(d)).attr('width', d => x(Math.min(d + 10, hi)) - x(d)).attr('height', sw.H);
    bands.append('text').attr('class', 'dc2-lab').attr('x', d => x(d) + 8).attr('y', narrow ? 24 : 44).text(d => (x(d + 10) - x(d) > 110 ? `${d}s` : `’${String(d).slice(2)}`));
    box.addEventListener('pointerleave', () => tip.hide());

    const count = () => el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!, b.dataset.plain !== undefined ? { fmt: n => String(Math.round(n)) } : {}));
    const io = onVisible(box, () => { sw.play(); count(); }, { threshold: 0.15 });
    stops.push(() => { io.disconnect(); sw.stop(); tip.hide(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
