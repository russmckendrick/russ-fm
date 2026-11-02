import { head, onVisible, countUp, esc, plural, MONTHS_LONG, ymd, dim, reduced, clamp } from '../core.js';

let el, stops = [];
const cleanup = () => { stops.forEach(f => f()); stops = []; };

// Fanart is landscape and faces sit high; the photo carries its own focus point.
const pic = a => a.fanart || a.photo;
const pos = a => (a.fanart ? '50% 28%' : a.focus ? `${a.focus[0] * 100}% ${a.focus[1] * 100}%` : '50% 30%');
const recordsOf = (data, a) => data.releases.filter(r => r.a.includes(a.s));
const lead = (data, a) => recordsOf(data, a).find(r => r.c?.flood)?.c.flood || '#e9a23b';
// Position through the year in months, e.g. 15 March = 2.45.
const monthPos = d => { const [y, m, dd] = ymd(d); return m - 1 + (dd - 1) / dim(y, m - 1); };

export default {
  id: 'artists',
  init(e) { el = e; },
  render(data) {
    cleanup();
    const arts = data.artists;
    if (!arts.length) { el.innerHTML = ''; return; }
    // Compilations aren't one artist, so they sit out of the rankings.
    const ranked = arts.filter(a => a.s !== 'various');
    const [top, ...rest] = ranked;
    const topRecs = recordsOf(data, top);
    const fresh = arts.filter(a => a.new).length;
    const once = arts.filter(a => a.n === 1).length;
    const size = Math.round(clamp(1500 / top.name.length, 56, 210));

    el.innerHTML = `
      <div class="wrap">
        ${head('B2', 'Artists', 'Who you collected', `${plural(arts.length, 'artist')} across ${plural(data.releases.length, 'record')}. ${plural(fresh, 'of them was', 'of them were')} new to the collection.`)}
        <div class="stats ar-stats">
          <div class="stat"><b data-n="${arts.length}">0</b><span>artists</span></div>
          <div class="stat"><b data-n="${fresh}">0</b><span>new to the collection</span></div>
          <div class="stat"><b data-n="${top.n}">0</b><span>records from ${esc(top.name)}, the most from one artist</span></div>
          <div class="stat"><b data-n="${once}">0</b><span>artists with a single record</span></div>
        </div>
      </div>
      <div class="ar-hero" style="--c:${lead(data, top)}">
        <div class="ar-kb"><img src="${pic(top)}" alt="" style="object-position:${pos(top)}"></div>
        <div class="ar-shade"></div>
        <div class="wrap ar-hero-in">
          <p class="label ar-kicker">Most collected · ${plural(top.n, 'record')}${top.new ? ' · new this year' : ''}</p>
          <h3 class="display ar-name" style="font-size:clamp(48px, 11vw, ${size}px)"><a href="/artist/${top.s}/">${esc(top.name)}</a></h3>
          <p class="ar-meta">${[top.from, top.formed && `formed ${top.formed}`].filter(Boolean).map(esc).join(' · ')}</p>
        </div>
        <div class="ar-fan">${topRecs.slice(0, 6).map((r, i, all) => `
          <a href="/album/${r.s}/" style="--i:${i};--k:${i - (all.length - 1) / 2}" title="${esc(r.t)}"><img src="${r.img}" alt="${esc(r.t)}"></a>`).join('')}
        </div>
      </div>
      <div class="wrap">
        <div class="ar-grid">${rest.slice(0, 5).map((a, i) => {
          const recs = recordsOf(data, a);
          return `
          <a class="ar-card" href="/artist/${a.s}/" style="--i:${i};--c:${lead(data, a)}">
            <img class="ar-bg" src="${pic(a)}" alt="" loading="lazy" style="object-position:${pos(a)}">
            <span class="ar-rank">${String(i + 2).padStart(2, '0')}</span>
            <div class="ar-card-in">
              <b>${esc(a.name)}</b>
              <span>${plural(a.n, 'record')}${a.new ? ' · new' : ''}</span>
              <div class="ar-mini">${recs.slice(0, 4).map(r => `<img src="${r.img}" alt="" loading="lazy">`).join('')}</div>
            </div>
          </a>`;
        }).join('')}</div>

        <div class="race">
          <div class="race-head">
            <div>
              <p class="label race-k">The race</p>
              <div class="race-tick"><b class="race-month">January</b><span class="race-sum">0 records</span></div>
            </div>
            <button class="pill sm race-play" type="button">Play</button>
          </div>
          <div class="race-bars"></div>
          <input class="race-scrub" type="range" min="0" max="1000" value="0" aria-label="Race position">
          <p class="race-foot">Records per artist, added up through the year.</p>
        </div>
      </div>`;

    onVisible(el.querySelector('.ar-stats'), () => el.querySelectorAll('.ar-stats [data-n]').forEach(b => countUp(b, +b.dataset.n)));
    onVisible(el.querySelector('.ar-hero'), () => el.querySelector('.ar-hero').classList.add('in'), { threshold: 0.15 });
    onVisible(el.querySelector('.ar-grid'), () => el.querySelector('.ar-grid').classList.add('in'), { threshold: 0.1 });
    race(data);
  },
};

function race(data) {
  const box = el.querySelector('.race-bars');
  const end = data.ytd ? Math.min(12, Math.ceil(Math.max(...data.releases.map(r => monthPos(r.d))) + 0.3)) : 12;
  const ps = new Map(data.artists.map(a => [a.s, []]));
  for (const r of data.releases) for (const s of r.a) ps.get(s)?.push(monthPos(r.d));
  // Each record grows in over a third of a month so bars glide rather than jump.
  const value = (s, t) => ps.get(s).reduce((v, p) => v + clamp((t - p) / 0.33, 0, 1), 0);
  const rank = t => data.artists.filter(a => a.s !== 'various').map(a => ({ a, v: value(a.s, t), f: ps.get(a.s)[0] ?? 99 }))
    .sort((x, y) => y.v - x.v || x.f - y.f);

  // Only artists that ever make the top ten get a bar.
  const pool = new Set();
  for (let t = 0; t <= end; t += 0.1) rank(t).slice(0, 10).forEach(x => x.v > 0 && pool.add(x.a.s));
  const bars = new Map();
  for (const s of pool) {
    const a = data.artistBySlug.get(s);
    const div = document.createElement('div');
    div.className = 'rb';
    div.style.setProperty('--c', lead(data, a));
    div.innerHTML = `<i class="rb-fill"></i><img src="${a.avatar}" alt="" onerror="this.style.visibility='hidden'"><span class="rb-name">${esc(a.name)}</span><b class="rb-n">0</b>`;
    box.append(div);
    bars.set(s, div);
  }

  const month = el.querySelector('.race-month'), sum = el.querySelector('.race-sum');
  const btn = el.querySelector('.race-play'), scrub = el.querySelector('.race-scrub');
  const total = data.releases.map(r => monthPos(r.d));
  let t = 0, playing = false, raf = 0, last = 0;

  const draw = () => {
    const ranked = rank(t);
    const max = Math.max(3, ranked[0].v);
    const shown = new Set();
    ranked.slice(0, 10).forEach((x, i) => {
      const b = bars.get(x.a.s);
      if (!b || x.v <= 0) return;
      shown.add(x.a.s);
      b.style.setProperty('--r', i);
      b.style.setProperty('--w', (x.v / max).toFixed(4));
      b.querySelector('.rb-n').textContent = Math.round(x.v);
    });
    for (const [s, b] of bars) b.classList.toggle('on', shown.has(s));
    month.textContent = MONTHS_LONG[Math.min(11, Math.floor(t))];
    sum.textContent = plural(total.filter(p => p <= t).length, 'record') + ' so far';
    scrub.value = Math.round((t / end) * 1000);
  };
  const frame = now => {
    t = Math.min(end, t + ((now - last) / 11000) * 12);
    last = now;
    draw();
    if (t >= end) return pause();
    raf = requestAnimationFrame(frame);
  };
  const play = () => {
    if (t >= end) t = 0;
    playing = true; btn.textContent = 'Pause';
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  function pause() { playing = false; btn.textContent = t >= end ? 'Replay' : 'Play'; cancelAnimationFrame(raf); }

  btn.addEventListener('click', () => (playing ? pause() : play()));
  scrub.addEventListener('input', () => { pause(); t = (scrub.value / 1000) * end; draw(); });
  draw();
  if (reduced) { t = end; draw(); pause(); }
  else {
    const io = onVisible(box, () => { if (t === 0) play(); }, { threshold: 0.4 });
    stops.push(() => io.disconnect());
  }
  stops.push(() => cancelAnimationFrame(raf));
}
