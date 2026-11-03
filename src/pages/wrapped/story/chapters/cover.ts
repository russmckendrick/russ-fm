// Cover: the year over a drifting wall of its own sleeves, the headline numbers, and how it compares.
import { area, curveMonotoneX, line, max as dmax, scaleLinear } from 'd3';
import { $, bus, countUp, esc, goToYear, MONTHS_LONG, onVisible, plural, reduced, type Chapter, type Story } from '../core';

export default function cover(el: HTMLElement): Chapter {
  el.innerHTML = `
    <div class="cv-wall" aria-hidden="true"><div class="cv-plane"></div></div>
    <div class="cv-shade"></div>
    <div class="wrap cv-inner">
      <p class="label cv-kicker">Russ.fm · Wrapped</p>
      <h1 class="display cv-year"></h1>
      <p class="cv-line"></p>
      <div class="stats cv-stats"></div>
      <div class="cv-cta">
        <button class="cv-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Flick through the year</button>
        <a class="label" href="#record">or scroll ↓</a>
      </div>
      <div class="cv-years">
        <div class="cv-years-head"><p class="label">Records added each month since <span class="cv-since"></span></p><p class="cv-compare"></p></div>
        <div class="cv-graph"></div>
      </div>
    </div>`;
  const onPlay = () => bus.dispatchEvent(new Event('play'));
  const onBar = (e: Event) => {
    const y = (e.target as Element).closest<HTMLElement>('[data-y]')?.dataset.y;
    if (y) goToYear(+y);
  };
  $('.cv-play', el).addEventListener('click', onPlay);
  $('.cv-graph', el).addEventListener('click', onBar);
  let io: IntersectionObserver | undefined, gio: IntersectionObserver | undefined, D: Story | null = null, rz = 0;
  const onResize = () => { clearTimeout(rz); rz = window.setTimeout(() => D && graph(D, false), 150); };
  addEventListener('resize', onResize);

  // Every month since the first year as one smooth line; the year on show is lit in amber.
  function graph(S: Story, animate: boolean) {
    const box = $('.cv-graph', el);
    const years = Object.keys(S.perMonth).map(Number).sort((a, b) => a - b);
    const pts = years.flatMap(y => S.perMonth[y].map((n, m) => ({ y, m, n })));
    const W = box.clientWidth, H = W < 600 ? 170 : 230, T = 34, B = 30;
    const x = scaleLinear().domain([0, pts.length - 1]).range([0, W]);
    const yv = scaleLinear().domain([0, dmax(pts, p => p.n) ?? 1]).nice().range([H - B, T]);
    const ix = (y: number, m: number) => (y - years[0]) * 12 + m;
    const lineOf = line<{ n: number }>().x((_, i) => x(i)).y(p => yv(p.n)).curve(curveMonotoneX);
    const areaOf = area<{ n: number }>().x((_, i) => x(i)).y0(H - B).y1(p => yv(p.n)).curve(curveMonotoneX);
    const avg = pts.reduce((a, p) => a + p.n, 0) / pts.length;
    const on = years.indexOf(S.year) >= 0 ? S.year : null;
    const x0 = on ? x(ix(on, 0)) : 0, x1 = on ? x(ix(on, S.perMonth[on].length - 1)) : 0;
    const peak = on ? S.perMonth[on].reduce((b, n, m) => (n > S.perMonth[on][b] ? m : b), 0) : 0;
    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Records added each month from ${years[0]} to ${years.at(-1)}">
      <defs>
        <linearGradient id="cvg-all" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf7ef" stop-opacity=".16"/><stop offset="1" stop-color="#fbf7ef" stop-opacity="0"/></linearGradient>
        <linearGradient id="cvg-on" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9a23b" stop-opacity=".55"/><stop offset="1" stop-color="#e9a23b" stop-opacity="0"/></linearGradient>
        <clipPath id="cvg-clip"><rect x="${x0}" y="0" width="${Math.max(0, x1 - x0)}" height="${H}"/></clipPath>
      </defs>
      ${years.map(y => {
        const a = x(ix(y, 0)), b = x(ix(y, S.perMonth[y].length - 1)), mid = (a + b) / 2;
        return `<g class="cv-yr${y === on ? ' on' : ''}" data-y="${y}">
          <rect x="${a - 2}" y="0" width="${b - a + 4}" height="${H}" class="cv-yr-hit"/>
          <line x1="${a}" x2="${a}" y1="${T - 8}" y2="${H - B}" class="cv-yr-rule"/>
          <text x="${mid}" y="${H - 8}" class="cv-yr-name">${W < 600 ? `'${String(y).slice(2)}` : y}</text>
          <text x="${mid}" y="${T - 14}" class="cv-yr-total">${S.perYear[y]}</text>
        </g>`;
      }).join('')}
      <line x1="0" x2="${W}" y1="${yv(avg)}" y2="${yv(avg)}" class="cv-avg"/>
      <text x="${W}" y="${yv(avg) - 6}" class="cv-avg-label">avg ${Math.round(avg)} a month</text>
      <path d="${areaOf(pts)}" fill="url(#cvg-all)" class="cv-area"/>
      <path d="${lineOf(pts)}" class="cv-line-all"/>
      ${on ? `<g clip-path="url(#cvg-clip)"><path d="${areaOf(pts)}" fill="url(#cvg-on)" class="cv-area"/><path d="${lineOf(pts)}" class="cv-line-on"/></g>
      <circle cx="${x(ix(on, peak))}" cy="${yv(S.perMonth[on][peak])}" r="5" class="cv-peak"/>
      <text x="${x(ix(on, peak))}" y="${yv(S.perMonth[on][peak]) - 12}" class="cv-peak-label">${S.perMonth[on][peak]} in ${MONTHS_LONG[peak]}</text>` : ''}
    </svg>`;
    if (animate && !reduced()) {
      for (const p of box.querySelectorAll<SVGPathElement>('.cv-line-all, .cv-line-on')) {
        const len = p.getTotalLength();
        p.animate([{ strokeDasharray: `${len}`, strokeDashoffset: `${len}` }, { strokeDasharray: `${len}`, strokeDashoffset: '0' }], { duration: 1800, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
      }
      for (const a of box.querySelectorAll('.cv-area, .cv-peak, .cv-peak-label')) a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 900, fill: 'backwards' });
    }
  }

  return {
    render(story: Story) {
      // Five rows of sleeves, each doubled so the drift loops without a seam. The rows share a pool
      // of 40, each starting at a different place in it, so the cover fetches 40 sleeves, not 110.
      const pool = [...story.releases].sort(() => Math.random() - 0.5).slice(0, 40);
      $('.cv-plane', el).innerHTML = Array.from({ length: 5 }, (_, i) => {
        const tiles = Array.from({ length: 22 }, (_, k) => `<img src="${pool[(i * 9 + k) % pool.length].img}" alt="" loading="lazy">`).join('');
        return `<div class="cv-row" style="--dur:${70 + i * 12}s;--dir:${i % 2 ? 'reverse' : 'normal'}">${tiles}${tiles}</div>`;
      }).join('');

      $('.cv-year', el).innerHTML = [...String(story.year)].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('') +
        (story.ytd ? '<small>so far</small>' : '');
      const fresh = story.artists.filter(a => a.new).length;
      $('.cv-line', el).innerHTML = `${plural(story.releases.length, 'record')} from ${plural(story.artists.length, 'artist')}, ${fresh} of them new to the shelves. First in: <b>${esc(story.releases[0].t)}</b>. Last in: <b>${esc(story.releases.at(-1)!.t)}</b>.`;

      const stats: Array<[number, string]> = [
        [story.releases.length, 'records added'],
        [story.artists.length, 'artists'],
        [fresh, 'new to the collection'],
        [story.days.length, 'days with a new record'],
      ];
      $('.cv-stats', el).innerHTML = stats.map(([, s]) => `<div class="stat"><b>0</b><span>${s}</span></div>`).join('');
      io?.disconnect();
      io = onVisible(el, () => el.querySelectorAll('.cv-stats b').forEach((b, i) => countUp(b, stats[i][0], { dur: 1400 + i * 200 })));

      const years = Object.entries(story.perYear);
      const full = years.filter(([y]) => +y !== story.year || !story.ytd);
      const avg = full.reduce((a, [, n]) => a + n, 0) / Math.max(1, full.length);
      const prev = story.perYear[story.year - 1], n = story.releases.length;
      const vs = (a: number, b: number) => (a > b ? `${a - b} more than` : a < b ? `${b - a} fewer than` : 'the same as');
      $('.cv-compare', el).innerHTML = story.ytd
        ? `${plural(n, 'record')} so far, against an average of ${Math.round(avg)} a year.`
        : `${plural(n, 'record')}${prev ? `, ${vs(n, prev)} ${story.year - 1}` : ''}, and ${n >= avg ? `${Math.round(n - avg)} above` : `${Math.round(avg - n)} below`} the ${full.length}-year average of ${Math.round(avg)}.`;
      $('.cv-since', el).textContent = years[0]?.[0] ?? '';
      D = story;
      graph(story, false);
      gio?.disconnect();
      gio = onVisible($('.cv-graph', el), () => graph(story, true), { threshold: 0.4 });
    },
    dispose() {
      io?.disconnect();
      gio?.disconnect();
      clearTimeout(rz);
      removeEventListener('resize', onResize);
      el.innerHTML = '';
    },
  };
}
