// 03 · How far in: for the most collected acts, a line from the year they started (TheAudioDB's
// formed year) to the day their first record arrived here, a mark where they died, and the
// acts' TheAudioDB moods and line-ups below.
import * as d3 from 'd3';
import { countUp, esc, head, onVisible, plural } from '../../wrapped/story/core';
import type { StatsArtist } from '@/types/stats';
import { fallback, n, onWidthChange, tooltip, type StatsChapter, type StatsView } from '../kit';

const TOP = 30;
type Started = StatsArtist & { formed: number };
const arrived = (a: StatsArtist) => +a.first.slice(0, 4) + (+a.first.slice(5, 7) - 1) / 12;

export default function artists(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    cleanup();
    current = v;
    const started = v.artists.filter((a): a is Started => !!a.formed && a.formed <= arrived(a));
    if (started.length < 5) { el.innerHTML = ''; return; }
    const gaps = started.map(a => arrived(a) - a.formed);
    const fresh = started.filter(a => arrived(a) - a.formed < 2).length;
    const split = v.artists.filter(a => a.split).length, died = v.artists.filter(a => a.died).length;
    // A solo artist who died can also be marked split; count each act once.
    const gone = v.artists.filter(a => a.split || a.died).length;
    const moods = d3.rollups(v.artists.filter(a => a.mood), x => x.length, a => a.mood!).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const gender = d3.rollups(v.artists.filter(a => a.gender), x => x.length, a => a.gender!).sort((a, b) => b[1] - a[1]);
    const lanes = started.slice(0, TOP).sort((a, b) => a.formed - b.formed);

    el.innerHTML = `<div class="wrap">
      ${head('03', 'How far in', 'Late to the party', `The ${lanes.length} most collected acts, from the year they started to the day their first record arrived on these shelves. A cross marks a death.`)}
      <div class="stats st-stats">
        <div class="stat"><b data-n="${Math.round(d3.median(gaps)!)}">0</b><span>years, typically, between an act starting out and their first record arriving here</span></div>
        <div class="stat"><b data-n="${fresh}">0</b><span>acts collected within a couple of years of starting</span></div>
        <div class="stat"><b data-n="${gone}">0</b><span>acts no longer going: ${n(split)} split up, ${n(died)} have died</span></div>
      </div>
      <div class="ar-chart"></div>
      <div class="ar-facts">
        ${moods.length ? `<div><p class="label ar-k">Moods, says TheAudioDB</p><p class="ar-chips">${moods.map(([m, c]) => `<span>${esc(m)} <b>${c}</b></span>`).join('')}</p></div>` : ''}
        ${gender.length ? `<div><p class="label ar-k">Line-ups</p><p class="ar-chips">${gender.map(([g, c]) => `<span>${esc(g)} <b>${c}</b></span>`).join('')}</p></div>` : ''}
      </div>
      <p class="ar-foot">From TheAudioDB, which has a start year for ${plural(started.length, 'act')} of ${n(v.artists.length)}, a mood for ${n(d3.sum(moods, m => m[1]))} and a line-up for ${n(d3.sum(gender, g => g[1]))}.</p>
    </div>`;

    const box = el.querySelector<HTMLElement>('.ar-chart')!;
    const W = box.clientWidth, narrow = W < 640, lab = narrow ? 112 : 200, rowH = narrow ? 24 : 28, H = lanes.length * rowH + 30;
    const now = new Date().getFullYear() + 1;
    const x = d3.scaleLinear([Math.floor(d3.min(lanes, a => a.formed)! / 10) * 10, now], [lab + 16, W - 12]);
    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', 'Each act from the year it started to its first record on the shelves');
    const decades = d3.range(Math.ceil(x.domain()[0] / 10) * 10, now, 10);
    svg.append('g').selectAll('line').data(decades).join('line').attr('class', 'lh-tick').attr('x1', x).attr('x2', x).attr('y2', H - 22);
    svg.append('g').selectAll('text').data(decades).join('text').attr('class', 'lh-yr').attr('x', d => x(d) + 4).attr('y', H - 6).text(d => (narrow ? `’${String(d).slice(2)}` : `${d}s`));
    const rows = svg.append('g').selectAll('g').data(lanes).join('g').attr('class', 'ar-row').attr('transform', (_, i) => `translate(0,${i * rowH + rowH / 2})`);
    rows.append('a').attr('href', a => `/artist/${a.s}/`).append('text').attr('class', 'lh-name').attr('x', lab).attr('dy', '0.35em').attr('text-anchor', 'end').text(a => a.name);
    rows.append('line').attr('class', 'ar-span').attr('x1', a => x(a.formed)).attr('x2', a => x(a.formed)).attr('stroke', a => a.f ?? fallback);
    rows.append('circle').attr('class', 'ar-start').attr('cx', a => x(a.formed)).attr('r', 4);
    rows.append('circle').attr('class', 'ar-first').attr('cx', a => x(a.formed)).attr('r', narrow ? 5 : 7).attr('fill', a => a.f ?? fallback);
    rows.filter(a => !!a.died).append('text').attr('class', 'ar-died').attr('x', a => x(a.died!)).attr('dy', '0.35em').attr('text-anchor', 'middle').text('✕');
    rows.on('pointermove', (e: PointerEvent, a) => tip.show(e, () => `<b>${esc(a.name)}</b>Started ${a.formed}${a.born ? ` (born ${a.born})` : ''} · first record here ${new Date(a.first).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}<br>${plural(a.n, 'record')} on the shelves${a.died ? ` · died ${a.died}` : a.split ? ' · split up' : ''}<div class="thumbs"><img src="${v.avatar(a.s)}" alt=""></div>`, a))
      .on('pointerleave', () => tip.hide());

    const io = onVisible(box, () => {
      // Each line runs out from the start year to the first record.
      rows.select('.ar-span').transition().duration(1200).delay((_, i) => i * 30).attr('x2', a => x(arrived(a)));
      rows.select('.ar-first').transition().duration(1200).delay((_, i) => i * 30).attr('cx', a => x(arrived(a)));
      el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!));
    }, { threshold: 0.15 });
    stops.push(() => { io.disconnect(); rows.selectAll('*').interrupt(); tip.hide(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
