import { head, onVisible, countUp, esc, plural, ease, reduced, clamp } from '../core.js';

// How much vinyl: every disc stacked flat to scale, and the year's run time as one long reel.
let el, ios = [], raf = 0;
const tip = Object.assign(document.createElement('div'), { className: 'tip' });
document.body.append(tip);

const WIDTH_MM = { '12"': 302, '10"': 250, '7"': 175 };
const SIDE_MIN = { '12"': 21, '10"': 13, '7"': 4 };
const SLEEVE_MM = 314;
const dur = s => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };

function showTip(e, html) {
  tip.innerHTML = html;
  tip.style.left = (e.clientX + 300 > innerWidth ? e.clientX - 300 : e.clientX + 16) + 'px';
  tip.style.top = e.clientY + 14 + 'px';
  tip.classList.add('on');
}
const recTip = (r, extra) => `<div class="wt-tip"><img src="${r.img}" alt=""><div><b>${esc(r.t)}</b>${esc(r.by)}<br><span>${extra}</span></div></div>`;

export default {
  id: 'weight',
  init(e) {
    el = e;
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => el.__layout?.(), 150); });
  },
  render(data) {
    ios.forEach(io => io.disconnect());
    ios = [];
    cancelAnimationFrame(raf);
    const recs = data.releases;
    const discs = recs.reduce((a, r) => a + r.discs, 0);
    const grams = recs.reduce((a, r) => a + r.g_wt, 0);
    const timed = recs.filter(r => r.rt);
    const known = timed.reduce((a, r) => a + r.rt, 0);
    const est = recs.filter(r => !r.rt).reduce((a, r) => a + r.discs * 2 * (SIDE_MIN[r.size] ?? 21) * 60, 0);
    const hours = (known + est) / 3600;

    // One entry per disc, bottom of the pile first (January).
    const pile = recs.flatMap(r => Array.from({ length: r.discs }, (_, k) => {
      const per = r.g_wt / r.discs;
      return { r, k, mm: 0.9 + per * 0.006, w: WIDTH_MM[r.size] ?? 302, vc: r.vc[k] || r.vc[0] };
    }));
    const stackMM = pile.reduce((a, d) => a + d.mm, 0);
    const longest = timed.reduce((a, r) => (r.rt > a.rt ? r : a), timed[0]);
    const shortest = timed.reduce((a, r) => (r.rt < a.rt ? r : a), timed[0]);

    el.innerHTML = `<div class="wrap">
      ${head('A4', 'By weight and length', 'Weight and length', `Every disc added in ${data.year}, stacked flat and drawn to scale, then the run time of every record with track times, end to end.`)}
      <div class="stats wt-stats">
        <div class="stat"><b data-count="${discs}">0</b><span>discs, across ${plural(recs.length, 'record')}</span></div>
        <div class="stat"><b><span data-count="${discs * 2}">0</span></b><span>sides to play</span></div>
        <div class="stat"><b><span data-count="${grams / 1000}" data-dp="1">0</span><small> kg</small></b><span>of vinyl, going by the pressing weights (about 140 g when Discogs doesn't say)</span></div>
        <div class="stat"><b>≈<span data-count="${Math.round(hours)}">0</span><small> h</small></b><span>of music: ${Math.round(known / 3600)} h from track times on ${timed.length} records, the rest estimated at ${SIDE_MIN['12"']} min a side</span></div>
      </div>
      <div class="wt-pile">
        <div class="wt-pile-text">
          <p class="label">Stacked flat</p>
          <p class="wt-big"><span data-count="${stackMM / 10}" data-dp="0">0</span> cm</p>
          <p class="wt-sub">That's ${(stackMM / SLEEVE_MM).toFixed(1)} record sleeves high. January is at the bottom; hover a disc to see which record it is.</p>
        </div>
        <div class="wt-stage"><canvas class="wt-stack"></canvas></div>
      </div>
      ${timed.length ? `<div class="wt-reel-head">
        <p class="label">End to end · ${dur(known)}</p>
        <p class="wt-sub">Each bar is one record, as long as its run time, in the order they were added.</p>
      </div>
      <div class="wt-reel-wrap"><canvas class="wt-reel"></canvas></div>
      <div class="wt-ends">
        ${[['Longest', longest], ['Shortest', shortest]].map(([k, r]) => `<a class="wt-end" href="/album/${r.s}/">
          <img src="${r.img}" alt="">
          <div><p class="label">${k}</p><b>${esc(r.t)}</b><span>${esc(r.by)}</span><em>${dur(r.rt)} · ${plural(r.tracks, 'track')}</em></div>
        </a>`).join('')}
      </div>` : ''}
    </div>`;

    const stack = setupStack(el.querySelector('.wt-stack'), pile, stackMM, recs[0]);
    const reel = timed.length ? setupReel(el.querySelector('.wt-reel'), timed, known) : null;
    el.__layout = () => { stack.layout(); reel?.layout(); };
    el.__layout();

    ios.push(onVisible(el.querySelector('.wt-stats'), () => {
      el.querySelectorAll('[data-count]').forEach(b => countUp(b, +b.dataset.count, b.dataset.dp ? { fmt: n => n.toFixed(+b.dataset.dp === 0 ? 0 : 1) } : {}));
    }, { threshold: 0.3 }));
    ios.push(onVisible(el.querySelector('.wt-stage'), () => stack.start(), { threshold: 0.2 }));
    if (reel) ios.push(onVisible(el.querySelector('.wt-reel-wrap'), () => reel.start(), { threshold: 0.2 }));

    const loop = now => {
      stack.draw(now);
      reel?.draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  },
};

function setupStack(cv, pile, stackMM, first) {
  const ctx = cv.getContext('2d');
  const sleeve = new Image();
  sleeve.src = first.img;
  const S = { t0: null, done: false, rects: [] };
  const span = Math.min(3200, 900 + pile.length * 9);

  S.layout = () => {
    const W = cv.parentElement.clientWidth;
    const H = clamp(innerHeight * 0.7, 360, 640);
    const dpr = devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const tallest = Math.max(stackMM, SLEEVE_MM);
    // Fit both the height and the width of a 12" disc plus a standing sleeve beside it.
    const k = Math.min((H - 48) / tallest, (W - 70) / (302 + 24 + SLEEVE_MM));
    Object.assign(S, { W, H, dpr, k, base: H - 22, axis: 52 + (302 * k) / 2 });
    S.dirty = true;
  };
  S.start = () => { if (S.t0 === null) S.t0 = reduced ? -1e9 : performance.now(); };

  S.draw = now => {
    if (S.done && !S.dirty) return;
    const { W, H, dpr, k, base, axis } = S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Ruler every 10 cm
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (let cm = 0; cm * 10 <= Math.max(stackMM, SLEEVE_MM) + 1; cm += 10) {
      const y = base - cm * 10 * k;
      ctx.fillStyle = 'rgba(251,247,239,.4)';
      ctx.fillText(`${cm}`, 30, y + 3);
      ctx.fillStyle = 'rgba(251,247,239,.12)';
      ctx.fillRect(36, y, W - 36, 1);
    }
    ctx.fillStyle = 'rgba(251,247,239,.4)';
    ctx.fillText('CM', 30, 12);

    // The standing sleeve for scale
    const sx = 52 + 302 * k + 24 * k, sh = SLEEVE_MM * k;
    if (sleeve.complete && sleeve.naturalWidth) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sleeve, sx, base - sh, sh, sh);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(251,247,239,.35)';
    ctx.strokeRect(sx + 0.5, base - sh + 0.5, sh - 1, sh - 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(251,247,239,.6)';
    ctx.fillText('12" SLEEVE', sx, base + 16);

    let y = base, all = true;
    S.rects = [];
    const t = S.t0 === null ? -1 : now - S.t0;
    pile.forEach((d, i) => {
      const h = d.mm * k;
      const start = (i / pile.length) * span;
      const e = S.t0 === null ? 0 : ease((t - start) / 380);
      if (e < 1) all = false;
      if (e <= 0) { y -= h; return; }
      const w = d.w * k, x = axis - w / 2;
      const yy = y - h - (1 - e) * (H * 0.6);
      const glass = d.vc?.glass;
      ctx.globalAlpha = Math.min(1, e * 2);
      ctx.fillStyle = d.vc ? (glass ? 'rgba(214,226,232,.55)' : d.vc.hex[0]) : '#1b1a19';
      ctx.fillRect(x, yy, w, Math.max(0.8, h - (h > 2.2 ? 0.6 : 0)));
      const lw = 100 * k;
      ctx.fillStyle = d.r.c?.flood || '#888';
      ctx.globalAlpha *= glass ? 0.9 : 0.75;
      ctx.fillRect(axis - lw / 2, yy, lw, Math.max(0.8, h - (h > 2.2 ? 0.6 : 0)));
      ctx.globalAlpha = 1;
      S.rects.push({ y0: yy, y1: yy + h, x0: x, x1: x + w, d });
      y -= h;
    });
    // Height marker
    if (all) {
      const top = base - stackMM * k;
      ctx.strokeStyle = '#e9a23b';
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(36, top); ctx.lineTo(axis + (302 * k) / 2 + 8, top); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e9a23b';
      ctx.textAlign = 'left';
      ctx.fillText(`${(stackMM / 10).toFixed(0)} CM`, 40, top - 6);
    }
    S.done = all;
    S.dirty = !all || !sleeve.complete;
  };

  cv.addEventListener('pointermove', e => {
    const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    const hit = S.rects.find(r => y >= r.y0 - 0.5 && y <= r.y1 + 0.5 && x >= r.x0 && x <= r.x1);
    if (!hit) { tip.classList.remove('on'); return; }
    const d = hit.d;
    showTip(e, recTip(d.r, `${d.r.discs > 1 ? `Disc ${d.k + 1} of ${d.r.discs} · ` : ''}${d.r.size}${d.vc ? ` · ${esc(d.vc.n)}` : ''}`));
  });
  cv.addEventListener('pointerleave', () => tip.classList.remove('on'));
  return S;
}

function setupReel(cv, timed, total) {
  const ctx = cv.getContext('2d');
  const R = { t0: null, segs: [] };
  R.layout = () => {
    const W = cv.parentElement.clientWidth;
    const rows = W < 600 ? 14 : 9, rowH = W < 600 ? 18 : 24, gap = 12, lm = 44;
    const H = rows * (rowH + gap) + 6;
    const dpr = devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const pps = ((W - lm) * rows) / total;
    // Lay segments along rows, splitting any that run past a row end.
    R.segs = [];
    let x = 0, row = 0;
    for (const r of timed) {
      let left = r.rt * pps;
      while (left > 0.01) {
        const room = W - lm - x, w = Math.min(left, room);
        R.segs.push({ r, x: lm + x, y: row * (rowH + gap), w, start: (row * (W - lm) + x) / pps });
        x += w; left -= w;
        if (x >= W - lm - 0.01) { x = 0; row++; }
      }
    }
    Object.assign(R, { W, H, dpr, rowH, gap, lm, pps, rows });
  };
  R.start = () => { if (R.t0 === null) R.t0 = reduced ? -1e9 : performance.now(); };
  R.draw = now => {
    if (R.t0 === null || R.finished) return;
    const { W, H, dpr, rowH, gap, lm, pps } = R;
    const reach = ease((now - R.t0) / 2600) * total;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (let row = 0; row < R.rows; row++) {
      const y = row * (rowH + gap);
      ctx.fillStyle = 'rgba(251,247,239,.07)';
      ctx.fillRect(lm, y, W - lm, rowH);
      ctx.fillStyle = 'rgba(251,247,239,.45)';
      ctx.fillText(`${Math.round((row * (W - lm)) / pps / 3600)}H`, lm - 8, y + rowH / 2 + 4);
    }
    for (const s of R.segs) {
      if (s.start > reach) break;
      const w = Math.min(s.w, (reach - s.start) * pps);
      ctx.fillStyle = s.r.c?.flood || '#888';
      ctx.fillRect(s.x, s.y, Math.max(0, w - 1), rowH);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(s.x, s.y + rowH - 3, Math.max(0, w - 1), 3);
    }
    // Hour ticks
    ctx.fillStyle = 'rgba(14,13,12,.55)';
    for (let h = 1; h * 3600 < total; h++) {
      const p = h * 3600 * pps, row = Math.floor(p / (W - lm)), x = lm + (p % (W - lm));
      if (h * 3600 <= reach) ctx.fillRect(x, row * (rowH + gap), 1, 4);
    }
    if (reach >= total) R.finished = true;
  };
  cv.addEventListener('pointermove', e => {
    const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    const s = R.segs.find(s => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + R.rowH);
    if (!s) { tip.classList.remove('on'); return; }
    showTip(e, recTip(s.r, `${dur(s.r.rt)} · ${plural(s.r.tracks, 'track')}`));
  });
  cv.addEventListener('pointerleave', () => tip.classList.remove('on'));
  const relayout = R.layout;
  R.layout = () => { relayout(); R.finished = false; };
  return R;
}
