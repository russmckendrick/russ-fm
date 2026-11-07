// 02 · Mainstream to deep cuts: every record placed by its Last.fm listeners on a log scale,
// the shelves' plays added up, the most and least heard, and Last.fm's tags for them.
import * as d3 from 'd3';
import { countUp, esc, head, onVisible } from '../../wrapped/story/core';
import type { StatsRecord } from '@/types/stats';
import { big, n, onWidthChange, recordTip, swarm, tooltip, type StatsChapter, type StatsView } from '../kit';

type Heard = StatsRecord & { lis: number };

export default function reach(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    cleanup();
    current = v;
    const heard = v.records.filter((r): r is Heard => r.lis != null && r.lis > 0);
    if (!heard.length) { el.innerHTML = ''; return; }
    const t = v.totals;
    const byLis = [...heard].sort((a, b) => b.lis - a.lis);
    const tile = (r: Heard) => `<a class="rc-tile" href="/album/${r.s}/"><img src="${v.img(r.s)}" alt="" loading="lazy"><b>${esc(r.t)}</b><span>${esc(r.by)}</span><em>${big(r.lis)} listener${r.lis === 1 ? '' : 's'}</em></a>`;
    const loud = v.artists.filter(a => a.lis).sort((a, b) => b.lis! - a.lis!);
    const maxTag = v.tags[0]?.n ?? 1;

    el.innerHTML = `<div class="wrap">
      ${head('02', 'Mainstream to deep cuts', 'Who else is listening', `Every record with a Last.fm count, placed by how many people have played it there: the big records on the right, the ones hardly anyone else owns on the left.`)}
      <div class="stats st-stats">
        <div class="stat"><b>${big(t.plays)}</b><span>Last.fm plays of the ${n(t.playsKnown)} records it knows, added up</span></div>
        <div class="stat"><b data-n="${t.deep}">0</b><span>records with fewer than 1,000 listeners</span></div>
        ${loud.length > 1 ? `<div class="stat"><b>${big(loud[0].lis!)}</b><span>listeners for ${esc(loud[0].name)}, the biggest artist here; the smallest, ${esc(loud.at(-1)!.name)}, has ${n(loud.at(-1)!.lis!)}</span></div>` : ''}
      </div>
      <div class="rc-field"></div>
      <div class="rc-ends">
        <div><p class="label rc-k">Most heard</p><div class="rc-row">${byLis.slice(0, 6).map(tile).join('')}</div></div>
        <div><p class="label rc-k">Deepest cuts</p><div class="rc-row">${byLis.slice(-6).reverse().map(tile).join('')}</div></div>
      </div>
      <p class="label rc-k">What Last.fm calls them</p>
      <p class="rc-tags">${v.tags.slice(0, 32).map(g => `<span style="--s:${(0.75 + (g.n / maxTag) * 1.6).toFixed(2)}">${esc(g.name)}<b>${g.n}</b></span>`).join(' ')}</p>
    </div>`;

    const box = el.querySelector<HTMLElement>('.rc-field')!;
    const W = box.clientWidth;
    const x = d3.scaleLog([1, d3.max(heard, r => r.lis)! * 1.2], [16, W - 16]).clamp(true);
    const sw = swarm(box, heard.map(r => ({ r, x: x(r.lis) })), {
      r: W < 640 ? 2 : 3,
      tip: (e, it) => tip.show(e, () => recordTip(v, it.r, `<span style="color:var(--amber)">${n(it.r.lis!)}</span> listeners · ${n(it.r.pc ?? 0)} plays`), it),
    });
    for (const tick of [10, 100, 1e3, 1e4, 1e5, 1e6].filter(k => x(k) < W - 30)) {
      sw.bg.append('line').attr('class', 'rc-tick').attr('x1', x(tick)).attr('x2', x(tick)).attr('y2', sw.H);
      sw.bg.append('text').attr('class', 'rc-lab').attr('x', x(tick) + 6).attr('y', 14).text(tick >= 1e3 && tick < 1e4 ? '1k' : big(tick));
    }
    sw.bg.append('text').attr('class', 'rc-lab').attr('x', W - 8).attr('y', sw.H - 6).attr('text-anchor', 'end').text('Last.fm listeners →');
    box.addEventListener('pointerleave', () => tip.hide());

    const io = onVisible(box, () => {
      sw.play();
      el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!));
    }, { threshold: 0.15 });
    stops.push(() => { io.disconnect(); sw.stop(); tip.hide(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
