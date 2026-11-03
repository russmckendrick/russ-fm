// Finale: every sleeve of the year on one wall, re-sorted by date, colour or artist.
import { $, bus, esc, head, loadYear, onVisible, plural, reduced, state } from '../core.js';

let el, D, io;
const ORDERS = {
  date: (a, b) => a.d.localeCompare(b.d),
  // Vivid sleeves by hue, greys and blacks after them.
  colour: (a, b) => key(a) - key(b),
  artist: (a, b) => a.by.localeCompare(b.by) || a.d.localeCompare(b.d),
};
const key = r => ((r.c.vivid ?? 0) < 0.3 ? 2 : 0) + (r.c.hue ?? 0);

function init(root) {
  el = root;
  el.innerHTML = `
    <div class="wrap">
      <div class="fin-head"></div>
      <div class="fin-tools" role="group" aria-label="Order">
        ${Object.keys(ORDERS).map(o => `<button class="pill sm" data-o="${o}" aria-pressed="${o === 'date'}">By ${o}</button>`).join('')}
      </div>
      <div class="fin-wall"></div>
      <div class="fin-sum"></div>
    </div>`;
  $('.fin-tools', el).addEventListener('click', e => {
    const o = e.target.dataset.o;
    if (!o) return;
    el.querySelectorAll('[data-o]').forEach(b => b.setAttribute('aria-pressed', b.dataset.o === o));
    reorder(o);
  });
  $('.fin-sum', el).addEventListener('click', e => {
    if (e.target.closest('[data-again]')) bus.dispatchEvent(new Event('play'));
    const y = e.target.closest('[data-y]')?.dataset.y;
    if (y) { loadYear(+y); scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); }
  });
}

function render(data) {
  D = data;
  el.querySelectorAll('[data-o]').forEach(b => b.setAttribute('aria-pressed', b.dataset.o === 'date'));
  $('.fin-head', el).innerHTML = head('C', 'The run-out groove', `All ${D.releases.length} of them`,
    'Every record added this year on one wall. Sort it by when it came in, by sleeve colour, or by artist.');
  const wall = $('.fin-wall', el);
  wall.innerHTML = D.releases.map(r =>
    `<a href="/album/${r.s}/" data-s="${r.s}" title="${esc(r.t)} — ${esc(r.by)}"><img src="${r.img}" alt="" loading="lazy"></a>`).join('');
  wall.classList.remove('in');
  io?.disconnect();
  io = onVisible(wall, () => wall.classList.add('in'), { threshold: 0.05 });
  [...wall.children].forEach((t, i) => t.style.setProperty('--i', i));

  const discs = D.releases.reduce((s, r) => s + r.discs, 0), kg = D.releases.reduce((s, r) => s + r.g_wt, 0) / 1000;
  const years = Object.keys(D.perYear).map(Number);
  const prev = years.includes(D.year - 1) ? D.year - 1 : null, next = years.includes(D.year + 1) ? D.year + 1 : null;
  $('.fin-sum', el).innerHTML = `
    <p class="fin-big display">That was ${D.year}.</p>
    <p class="lede">${plural(D.releases.length, 'record')}, ${plural(D.artists.length, 'artist')}, ${plural(discs, 'disc')} and about ${kg.toFixed(1)} kg of vinyl.</p>
    <div class="fin-actions">
      <button class="pill" data-again>Play it again</button>
      ${prev ? `<button class="pill" data-y="${prev}">← ${prev}</button>` : ''}
      ${next ? `<button class="pill" data-y="${next}">${next} →</button>` : ''}
    </div>`;
}

// FLIP: note where each tile is, reorder, then animate each from its old spot.
function reorder(o) {
  const wall = $('.fin-wall', el), tiles = [...wall.children];
  const before = new Map(tiles.map(t => [t, t.getBoundingClientRect()]));
  const bySlug = new Map(D.releases.map(r => [r.s, r]));
  tiles.sort((a, b) => ORDERS[o](bySlug.get(a.dataset.s), bySlug.get(b.dataset.s))).forEach(t => wall.append(t));
  if (reduced) return;
  tiles.forEach((t, i) => {
    const a = before.get(t), b = t.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (!dx && !dy) return;
    t.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
      { duration: 900, delay: Math.min(i * 1.5, 500), easing: 'cubic-bezier(.6,0,.2,1)', fill: 'backwards' });
  });
}

export default { id: 'finale', init, render };
