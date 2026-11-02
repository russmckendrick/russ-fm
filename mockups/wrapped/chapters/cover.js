// Cover: the year over a drifting wall of its own sleeves, the headline numbers, and how it compares.
import { $, bus, countUp, esc, loadYear, onVisible, plural } from '../core.js';

let el;

function init(root) {
  el = root;
  el.innerHTML = `
    <div class="cv-wall" aria-hidden="true"><div class="cv-plane"></div></div>
    <div class="cv-shade"></div>
    <div class="wrap cv-inner">
      <p class="label cv-kicker">Russ.fm · Wrapped</p>
      <h1 class="display cv-year"></h1>
      <p class="cv-line"></p>
      <div class="stats cv-stats"></div>
      <div class="cv-cta">
        <button class="cv-play"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Flick through the year</button>
        <a class="label" href="#record">or scroll ↓</a>
      </div>
      <div class="cv-years"><p class="label">Records added each year</p><div class="cv-bars"></div></div>
    </div>`;
  $('.cv-play', el).addEventListener('click', () => bus.dispatchEvent(new Event('play')));
  $('.cv-bars', el).addEventListener('click', e => { const y = e.target.closest('[data-y]')?.dataset.y; if (y) loadYear(+y); });
}

function render(D) {
  // Five rows of sleeves, each doubled so the drift loops without a seam.
  const pool = [...D.releases].sort(() => Math.random() - 0.5);
  const rows = Array.from({ length: 5 }, (_, i) => {
    const row = [];
    for (let k = 0; row.length < 22; k++) row.push(pool[(i * 22 + k) % pool.length]);
    const tiles = row.map(r => `<img src="${r.img}" alt="" loading="lazy">`).join('');
    return `<div class="cv-row" style="--dur:${70 + i * 12}s;--dir:${i % 2 ? 'reverse' : 'normal'}">${tiles}${tiles}</div>`;
  });
  $('.cv-plane', el).innerHTML = rows.join('');

  $('.cv-year', el).innerHTML = [...String(D.year)].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('') +
    (D.ytd ? '<small>so far</small>' : '');
  const fresh = D.artists.filter(a => a.new).length;
  $('.cv-line', el).innerHTML = `${plural(D.releases.length, 'record')} from ${plural(D.artists.length, 'artist')}, ${fresh} of them new to the shelves. First in: <b>${esc(D.releases[0].t)}</b>. Last in: <b>${esc(D.releases.at(-1).t)}</b>.`;

  const stats = [
    [D.releases.length, 'records added'],
    [D.artists.length, 'artists'],
    [fresh, 'new to the collection'],
    [D.days.length, 'days with a new record'],
  ];
  $('.cv-stats', el).innerHTML = stats.map(([, s]) => `<div class="stat"><b>0</b><span>${s}</span></div>`).join('');
  onVisible(el, () => [...el.querySelectorAll('.cv-stats b')].forEach((b, i) => countUp(b, stats[i][0], { dur: 1400 + i * 200 })));

  const years = Object.entries(D.perYear), max = Math.max(...years.map(([, n]) => n));
  $('.cv-bars', el).innerHTML = years.map(([y, n], i) => `
    <button class="cv-bar${+y === D.year ? ' on' : ''}" data-y="${y}" title="${y}: ${n} records" style="--h:${(n / max) * 100}%;--i:${i}">
      <i></i><span>${+y === D.year ? n : ''}</span><em>'${y.slice(2)}</em>
    </button>`).join('');
}

export default { id: 'cover', init, render };
