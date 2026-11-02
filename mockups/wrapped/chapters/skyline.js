import { head, sleeve, shade, onVisible, countUp, selectDay, bus, state, MONTHS, utc, iso, longDate, shortDate, esc, plural, easeInOut, reduced, DAY, clamp } from '../core.js';

// The year as an oblique 3D skyline: one tower per day, one slab per record.
let el, data, raf = 0, ios = [], SK = null;
const tip = Object.assign(document.createElement('div'), { className: 'tip' });
document.body.append(tip);

export default {
  id: 'skyline',
  init(e) {
    el = e;
    bus.addEventListener('day', ev => {
      if (!SK || !data.byDay.has(ev.detail.day)) return;
      SK.sel = ev.detail.day;
      renderStrip();
    });
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => SK && layout(), 150); });
  },
  render(d) {
    data = d;
    cancelAnimationFrame(raf);
    ios.forEach(io => io.disconnect());
    ios = [];
    build();
  },
};

function build() {
  const y = data.year, jan1 = Date.UTC(y, 0, 1);
  const off = (new Date(jan1).getUTCDay() + 6) % 7;
  const n = (Date.UTC(y, 11, 31) - jan1) / DAY + 1;
  const end = Math.min(Date.UTC(y, 11, 31), Date.now());
  SK = {
    jan1, off, n, end, weeks: Math.floor((n - 1 + off) / 7) + 1,
    maxN: Math.max(...[...data.byDay.values()].map(l => l.length)),
    lift: { from: 1, to: 1, t0: 0 }, rise: reduced ? -1e9 : null, visible: false,
    sel: data.biggest, hulls: [], hover: null,
  };

  el.innerHTML = `<div class="wrap">
    ${head('A2', 'Every day', `Every day of ${y}`, 'One tower for each day, one slab for each record added, in its sleeve colour. Sunday is the front row.')}
    <div class="stats sky-stats" id="sky-stats"></div>
    <div class="sky-tools">
      <div class="sky-toggle" role="group" aria-label="View">
        <button class="pill sm" data-lift="1" aria-pressed="true">Skyline</button>
        <button class="pill sm" data-lift="0" aria-pressed="false">Flat</button>
      </div>
      <span class="sky-hint">Hover a tower to see the day. Click to pick it.</span>
    </div>
    <div class="sky-wrap" id="sky-wrap"><canvas id="sky" aria-label="Calendar of ${y} with one tower per day"></canvas></div>
    <div class="sky-strip" id="sky-strip" aria-live="polite"></div>
  </div>`;

  renderFacts();
  layout();
  renderStrip();

  el.querySelector('.sky-toggle').addEventListener('click', e => {
    const b = e.target.closest('[data-lift]');
    if (!b) return;
    el.querySelectorAll('[data-lift]').forEach(x => x.setAttribute('aria-pressed', x === b));
    const now = performance.now();
    SK.lift = { from: liftAt(now), to: +b.dataset.lift, t0: now };
  });

  const cv = el.querySelector('#sky');
  cv.addEventListener('pointermove', e => {
    const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y2 = e.clientY - b.top;
    const h = [...SK.hulls].reverse().find(h => inside(h.pts, x, y2));
    SK.hover = h?.day || null;
    cv.style.cursor = h ? 'pointer' : 'default';
    if (!h) { tip.classList.remove('on'); return; }
    const list = data.byDay.get(h.day);
    tip.innerHTML = `<b>${longDate(h.day)}</b>${plural(list.length, 'record')}<div class="thumbs">${list.slice(0, 4).map(r => `<img src="${r.img}" alt="">`).join('')}</div>`;
    const tx = e.clientX + 16 + 290 > innerWidth ? e.clientX - 300 : e.clientX + 16;
    tip.style.left = tx + 'px';
    tip.style.top = e.clientY + 14 + 'px';
    tip.classList.add('on');
  });
  cv.addEventListener('pointerleave', () => { SK.hover = null; tip.classList.remove('on'); });
  cv.addEventListener('click', () => { if (SK.hover) selectDay(SK.hover, 'skyline'); });

  const wrap = el.querySelector('#sky-wrap');
  ios.push(onVisible(wrap, v => { SK.visible = v; }, { once: false, threshold: 0 }));
  ios.push(onVisible(wrap, () => {
    if (SK.rise === null) SK.rise = performance.now();
    el.querySelectorAll('[data-count]').forEach(b => countUp(b, +b.dataset.count));
  }, { threshold: 0.2 }));

  const loop = now => {
    if (SK.visible) draw(now);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function renderFacts() {
  const { days, byDay, biggest } = data;
  const total = Math.floor((SK.end - SK.jan1) / DAY) + 1;
  let gap = { n: 0 }, run = 1, best = days.length ? 1 : 0;
  for (let i = 1; i < days.length; i++) {
    const diff = (utc(days[i]) - utc(days[i - 1])) / DAY;
    if (diff - 1 > gap.n) gap = { n: diff - 1, from: iso(utc(days[i - 1]) + DAY), to: iso(utc(days[i]) - DAY) };
    run = diff === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const stat = (n, cap, extra = '') => `<div class="stat"><b><span data-count="${n}">0</span>${extra}</b><span>${cap}</span></div>`;
  el.querySelector('#sky-stats').innerHTML =
    stat(days.length, 'days with a new record', `<small> / ${total}</small>`) +
    stat(byDay.get(biggest).length, `records on ${longDate(biggest)}, the biggest day`) +
    stat(gap.n, gap.n ? `days without one, ${shortDate(gap.from)} – ${shortDate(gap.to)}` : 'days without a new record') +
    stat(best, best === 1 ? 'day in a row, at most' : 'days in a row with a new record');
}

function renderStrip() {
  const list = data.byDay.get(SK.sel) || [];
  el.querySelector('#sky-strip').innerHTML = `
    <p class="sky-when">${longDate(SK.sel)} <span>${plural(list.length, 'record')}</span></p>
    <div class="sky-row">${list.map(r => sleeve(r)).join('')}</div>`;
}

function layout() {
  const wrap = el.querySelector('#sky-wrap'), cv = el.querySelector('#sky');
  const W = wrap.clientWidth;
  const c = clamp((W - 40) / (SK.weeks + 6 * 0.72 + 1.2), 11, 24);
  Object.assign(SK, { c, s: c * 0.8, t: c * 0.64 });
  const H = Math.round(34 + Math.max(7 * c + 14, 3.6 * c + SK.maxN * SK.t + 78));
  const width = Math.round(26 + SK.weeks * c + 6 * 0.72 * c + c + 16);
  const dpr = devicePixelRatio || 1;
  cv.width = width * dpr;
  cv.height = H * dpr;
  cv.style.width = width + 'px';
  cv.style.height = H + 'px';
  Object.assign(SK, { W: width, H, x0: 26, y0: H - 30, dpr, ctx: cv.getContext('2d') });
  draw(performance.now());
}

function liftAt(now) {
  const { from, to, t0 } = SK.lift;
  return from + (to - from) * easeInOut(reduced ? 1 : (now - t0) / 900);
}

// 0..1 progress of a slab dropping in: a wave from January to December, slabs stacking in order.
function slabE(i, j, now) {
  if (SK.rise === null) return 0;
  return clamp((now - SK.rise - (i / SK.n) * 1700 - j * 70) / 460, 0, 1);
}

function poly(ctx, pts, fill) {
  ctx.beginPath();
  pts.forEach(([x, y], k) => ctx[k ? 'lineTo' : 'moveTo'](x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function draw(now) {
  const { ctx, dpr, c, s, t, x0, y0, W, H, jan1, off, n, end } = SK;
  const L = liftAt(now);
  const dvx = 0.72 * c * L, dvy = -c + 0.42 * c * L;
  const dX = dvx * (s / c), dY = dvy * (s / c);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  SK.hulls = [];

  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(251,247,239,.5)';
  ctx.textAlign = 'left';
  MONTHS.forEach((m, k) => {
    const w = Math.floor(((Date.UTC(data.year, k, 1) - jan1) / DAY + off) / 7);
    ctx.fillText(m.toUpperCase(), x0 + w * c, y0 + 20);
  });
  if (L < 0.6) {
    ctx.globalAlpha = 1 - L / 0.6;
    ['M', 'W', 'F'].forEach((d, k) => {
      const kk = 6 - k * 2;
      ctx.fillText(d, 8, y0 + kk * dvy + dY / 2 + 4);
    });
    ctx.globalAlpha = 1;
  }

  let big = null, selH = null;
  for (let k = 6; k >= 0; k--) {
    const dow = 6 - k;
    for (let w = 0; w < SK.weeks; w++) {
      const i = w * 7 + dow - off;
      if (i < 0 || i >= n) continue;
      const tday = jan1 + i * DAY, day = iso(tday), list = data.byDay.get(day);
      const bx = x0 + w * c + k * dvx, by = y0 + k * dvy;
      const floor = [[bx, by], [bx + s, by], [bx + s + dX, by + dY], [bx + dX, by + dY]];
      if (tday > end) {
        ctx.strokeStyle = 'rgba(251,247,239,.08)';
        ctx.beginPath(); floor.forEach(([x, yy], q) => ctx[q ? 'lineTo' : 'moveTo'](x, yy)); ctx.closePath(); ctx.stroke();
        continue;
      }
      poly(ctx, floor, 'rgba(251,247,239,.06)');
      if (!list) continue;

      let z = 0;
      if (L < 0.25) {
        const e = slabE(i, 0, now);
        ctx.globalAlpha = e;
        list.forEach((r, j) => {
          const u0 = j / list.length, u1 = (j + 1) / list.length;
          poly(ctx, [[bx + s * u0, by], [bx + s * u1, by], [bx + s * u1 + dX, by + dY], [bx + s * u0 + dX, by + dY]], r.c?.flood || '#888');
        });
        ctx.globalAlpha = 1;
      } else {
        list.forEach((r, j) => {
          const e = slabE(i, j, now);
          if (e <= 0) return;
          const h = t * L, zz = z + (1 - e) * 90, col = r.c?.flood || '#888888';
          ctx.globalAlpha = Math.min(1, e * 1.6);
          poly(ctx, [[bx + s, by - zz], [bx + s + dX, by - zz + dY], [bx + s + dX, by - zz - h + dY], [bx + s, by - zz - h]], shade(col, -0.42));
          ctx.fillStyle = col;
          ctx.fillRect(bx, by - zz - h, s, h);
          poly(ctx, [[bx, by - zz - h], [bx + s, by - zz - h], [bx + s + dX, by - zz - h + dY], [bx + dX, by - zz - h + dY]], shade(col, 0.24));
          ctx.fillStyle = 'rgba(0,0,0,.22)';
          ctx.fillRect(bx, by - zz - h, s, 0.6);
          z += h * e;
        });
        ctx.globalAlpha = 1;
      }
      const pts = z > 0
        ? [[bx, by], [bx + s, by], [bx + s + dX, by + dY], [bx + s + dX, by + dY - z], [bx + dX, by + dY - z], [bx, by - z]]
        : floor;
      const hull = { day, pts, top: [bx + s / 2 + dX / 2, by + dY / 2 - z] };
      SK.hulls.push(hull);
      if (day === data.biggest) big = hull;
      if (day === SK.sel) selH = hull;
    }
  }

  for (const [h, colr] of [[selH, '#fbf7ef'], [SK.hover && SK.hulls.find(x => x.day === SK.hover), 'rgba(251,247,239,.6)']]) {
    if (!h) continue;
    ctx.strokeStyle = colr;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); h.pts.forEach(([x, yy], q) => ctx[q ? 'lineTo' : 'moveTo'](x, yy)); ctx.closePath(); ctx.stroke();
  }

  if (big && L > 0.5 && slabE(0, 0, now) > 0) {
    const a = clamp((now - (SK.rise ?? now) - 2200) / 500, 0, 1) * (reduced ? 0 : 1) || (reduced ? 1 : 0);
    const [tx, ty] = big.top, ly = ty - 30;
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#e9a23b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx, ty - 4); ctx.lineTo(tx, ly); ctx.stroke();
    ctx.fillStyle = '#e9a23b';
    ctx.beginPath(); ctx.arc(tx, ty - 4, 2.5, 0, Math.PI * 2); ctx.fill();
    const label = `${shortDate(data.biggest).toUpperCase()} · ${data.byDay.get(data.biggest).length} RECORDS`;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = tx > W - 140 ? 'right' : tx < 140 ? 'left' : 'center';
    ctx.fillStyle = '#fbf7ef';
    ctx.fillText(label, tx, ly - 6);
    ctx.globalAlpha = 1;
  }
}
