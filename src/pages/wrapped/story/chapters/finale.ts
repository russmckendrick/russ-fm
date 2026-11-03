// Finale: every sleeve of the year on one wall, re-sorted by date, colour or artist.
import { $, bus, esc, goToYear, head, onVisible, plural, reduced, type Chapter, type Release, type Story } from '../core';

// Vivid sleeves by hue, greys and blacks after them.
const key = (r: Release) => ((r.c.vivid ?? 0) < 0.3 ? 2 : 0) + (r.c.hue ?? 0);
const ORDERS: Record<string, (a: Release, b: Release) => number> = {
  date: (a, b) => a.d.localeCompare(b.d),
  colour: (a, b) => key(a) - key(b),
  artist: (a, b) => a.by.localeCompare(b.by) || a.d.localeCompare(b.d),
};

export default function finale(el: HTMLElement): Chapter {
  let D: Story | null = null;
  let io: IntersectionObserver | undefined;

  el.innerHTML = `
    <div class="wrap">
      <div class="fin-head"></div>
      <div class="fin-tools" role="group" aria-label="Order">
        ${Object.keys(ORDERS).map(o => `<button class="pill sm" data-o="${o}" aria-pressed="${o === 'date'}">By ${o}</button>`).join('')}
      </div>
      <div class="fin-wall"></div>
      <div class="fin-sum"></div>
    </div>`;

  // FLIP: note where each tile is, reorder, then animate each from its old spot.
  function reorder(o: string) {
    const wall = $('.fin-wall', el), tiles = [...wall.children] as HTMLElement[];
    const before = new Map(tiles.map(t => [t, t.getBoundingClientRect()]));
    const bySlug = new Map(D!.releases.map(r => [r.s, r]));
    tiles.sort((a, b) => ORDERS[o](bySlug.get(a.dataset.s!)!, bySlug.get(b.dataset.s!)!)).forEach(t => wall.append(t));
    if (reduced()) return;
    tiles.forEach((t, i) => {
      const a = before.get(t)!, b = t.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      t.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
        { duration: 900, delay: Math.min(i * 1.5, 500), easing: 'cubic-bezier(.6,0,.2,1)', fill: 'backwards' });
    });
  }

  $('.fin-tools', el).addEventListener('click', e => {
    const o = (e.target as HTMLElement).dataset.o;
    if (!o || !D) return;
    el.querySelectorAll('[data-o]').forEach(b => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.o === o)));
    reorder(o);
  });
  $('.fin-sum', el).addEventListener('click', e => {
    const t = e.target as Element;
    if (t.closest('[data-again]')) bus.dispatchEvent(new Event('play'));
    const y = t.closest<HTMLElement>('[data-y]')?.dataset.y;
    if (y) { goToYear(+y); scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }
  });

  return {
    render(story: Story) {
      D = story;
      el.querySelectorAll('[data-o]').forEach(b => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.o === 'date')));
      $('.fin-head', el).innerHTML = head('C', 'The run-out groove', `All ${story.releases.length} of them`,
        'Every record added this year on one wall. Sort it by when it came in, by sleeve colour, or by artist.');
      const wall = $('.fin-wall', el);
      wall.innerHTML = story.releases.map((r, i) =>
        `<a href="/album/${r.s}/" data-s="${r.s}" title="${esc(r.t)} — ${esc(r.by)}" style="--i:${i}"><img src="${r.img}" alt="" loading="lazy"></a>`).join('');
      wall.classList.remove('in');
      io?.disconnect();
      io = onVisible(wall, () => wall.classList.add('in'), { threshold: 0.05 });

      const discs = story.releases.reduce((s, r) => s + r.discs, 0), kg = story.releases.reduce((s, r) => s + r.g_wt, 0) / 1000;
      const years = Object.keys(story.perYear).map(Number);
      const prev = years.includes(story.year - 1) ? story.year - 1 : null, next = years.includes(story.year + 1) ? story.year + 1 : null;
      $('.fin-sum', el).innerHTML = `
        <p class="fin-big display">That was ${story.year}.</p>
        <p class="lede">${plural(story.releases.length, 'record')}, ${plural(story.artists.length, 'artist')}, ${plural(discs, 'disc')} and about ${kg.toFixed(1)} kg of vinyl.</p>
        <div class="fin-actions">
          <button class="pill" data-again>Flick through it again</button>
          ${prev ? `<button class="pill" data-y="${prev}">← ${prev}</button>` : ''}
          ${next ? `<button class="pill" data-y="${next}">${next} →</button>` : ''}
        </div>`;
    },
    dispose() {
      io?.disconnect();
      el.innerHTML = '';
    },
  };
}
