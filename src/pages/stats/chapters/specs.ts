// 05 · Spec sheet: the pressing details read from the Discogs format text (180 g, 45 RPM,
// numbered, Record Store Day, etched…), each a card with its count and a fan of its sleeves.
import { countUp, esc, head, onVisible } from '../../wrapped/story/core';
import { n, type StatsChapter, type StatsView } from '../kit';

export default function specs(el: HTMLElement): StatsChapter {
  let io: IntersectionObserver | null = null;

  function render(v: StatsView) {
    io?.disconnect();
    const list = v.specs.filter(s => s.n);
    if (!list.length) { el.innerHTML = ''; return; }
    const t = v.totals;
    const get = (name: string) => list.find(s => s.name === name)?.n ?? 0;

    el.innerHTML = `<div class="wrap">
      ${head('05', 'Spec sheet', 'Read the small print', `What the sleeves say about the vinyl inside, from each pressing's Discogs format notes.`)}
      <div class="stats st-stats">
        <div class="stat"><b data-n="${get('180 g') + get('200 g')}">0</b><span>heavyweight pressings, 180 g or more</span></div>
        <div class="stat"><b data-n="${get('Limited edition')}">0</b><span>limited editions, ${get('Numbered')} of them numbered</span></div>
        <div class="stat"><b>${Math.round((t.coloured / t.records) * 100)}%</b><span>on coloured vinyl, ${n(t.coloured)} records</span></div>
      </div>
      <div class="sp-grid">${list.map((s, i) => `
        <div class="sp-card" style="--i:${i}">
          <div class="sp-fan">${s.s.slice(0, 4).map((slug, k) => `<a href="/album/${slug}/" style="--k:${k}" title="${esc(v.bySlug.get(slug)?.t ?? '')}"><img src="${v.img(slug)}" alt="" loading="lazy"></a>`).join('')}</div>
          <b>${n(s.n)}</b>
          <span>${esc(s.name)}</span>
          <em>${((s.n / t.records) * 100).toFixed(s.n / t.records < 0.01 ? 1 : 0)}%</em>
        </div>`).join('')}
      </div>
    </div>`;

    const grid = el.querySelector('.sp-grid')!;
    io = onVisible(grid, () => {
      grid.classList.add('in');
      el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!));
    }, { threshold: 0.15 });
  }

  return { render, dispose: () => io?.disconnect() };
}
