import { $, bus, clamp, countUp, DAY, easeInOut, head, iso, longDate, MONTHS, onVisible, plural, reduced, selectDay, shade, shortDate, sleeve, utc, type Chapter, type Story } from '../core';

// The year as an oblique 3D skyline: one tower per day, one slab per record.
type Pt = [number, number];
interface Hull { day: string; pts: Pt[]; top: Pt }
interface Sky {
  jan1: number; off: number; n: number; end: number; weeks: number; maxN: number;
  lift: { from: number; to: number; t0: number };
  rise: number | null; visible: boolean; sel: string; hulls: Hull[]; hover: string | null;
  c: number; s: number; t: number; W: number; H: number; x0: number; y0: number; dpr: number;
  ctx: CanvasRenderingContext2D;
  /** What the last frame showed, so a still skyline isn't redrawn */
  drawn: string;
}

function poly(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string) {
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function outline(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.stroke();
}

function inside(pts: Pt[], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export default function skyline(el: HTMLElement): Chapter {
  let data: Story | null = null, raf = 0, ios: IntersectionObserver[] = [], SK: Sky | null = null, rz = 0;
  const tip = Object.assign(document.createElement('div'), { className: 'ws-tip' });
  document.body.append(tip);

  const onDay = (ev: Event) => {
    const { day } = (ev as CustomEvent<{ day: string }>).detail;
    if (!SK || !data?.byDay.has(day)) return;
    SK.sel = day;
    renderStrip();
  };
  const onResize = () => { clearTimeout(rz); rz = window.setTimeout(() => SK && layout(), 150); };
  bus.addEventListener('day', onDay);
  addEventListener('resize', onResize);

  function stop() {
    cancelAnimationFrame(raf);
    ios.forEach(io => io.disconnect());
    ios = [];
  }

  function build(D: Story) {
    const y = D.year, jan1 = Date.UTC(y, 0, 1);
    const off = (new Date(jan1).getUTCDay() + 6) % 7;
    const n = (Date.UTC(y, 11, 31) - jan1) / DAY + 1;
    const end = Math.min(Date.UTC(y, 11, 31), Date.now());

    el.innerHTML = `<div class="wrap">
      ${head('', 'Every day', `Every day of ${y}`, 'One tower for each day, one slab for each record added, in its sleeve colour. Sunday is the front row.')}
      <div class="stats sky-stats"></div>
      <div class="sky-tools">
        <div class="sky-toggle" role="group" aria-label="View">
          <button class="pill sm" data-lift="1" aria-pressed="true">Skyline</button>
          <button class="pill sm" data-lift="0" aria-pressed="false">Flat</button>
        </div>
        <span class="sky-hint">Hover a tower to see the day. Click to pick it.</span>
      </div>
      <div class="sky-wrap"><canvas aria-label="Calendar of ${y} with one tower per day"></canvas></div>
      <div class="sky-strip" aria-live="polite"></div>
    </div>`;

    const cv = $<HTMLCanvasElement>('canvas', el);
    SK = {
      jan1, off, n, end, weeks: Math.floor((n - 1 + off) / 7) + 1,
      maxN: Math.max(...[...D.byDay.values()].map(l => l.length)),
      lift: { from: 1, to: 1, t0: 0 }, rise: reduced() ? -1e9 : null, visible: false,
      sel: D.biggest, hulls: [], hover: null,
      c: 0, s: 0, t: 0, W: 0, H: 0, x0: 26, y0: 0, dpr: 1, ctx: cv.getContext('2d')!, drawn: '',
    };

    renderFacts(D);
    layout();
    renderStrip();

    $('.sky-toggle', el).addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLElement>('[data-lift]');
      if (!b || !SK) return;
      el.querySelectorAll('[data-lift]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const now = performance.now();
      SK.lift = { from: liftAt(now), to: +b.dataset.lift!, t0: now };
    });

    cv.addEventListener('pointermove', e => {
      if (!SK) return;
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y2 = e.clientY - b.top;
      const h = [...SK.hulls].reverse().find(h => inside(h.pts, x, y2));
      SK.hover = h?.day ?? null;
      cv.style.cursor = h ? 'pointer' : 'default';
      if (!h) { tip.classList.remove('on'); return; }
      const list = D.byDay.get(h.day)!;
      tip.innerHTML = `<b>${longDate(h.day)}</b>${plural(list.length, 'record')}<div class="thumbs">${list.slice(0, 4).map(r => `<img src="${r.img}" alt="">`).join('')}</div>`;
      tip.style.left = (e.clientX + 16 + 290 > innerWidth ? e.clientX - 300 : e.clientX + 16) + 'px';
      tip.style.top = e.clientY + 14 + 'px';
      tip.classList.add('on');
    });
    cv.addEventListener('pointerleave', () => { if (SK) SK.hover = null; tip.classList.remove('on'); });
    cv.addEventListener('click', () => { if (SK?.hover) selectDay(SK.hover, 'skyline'); });

    const wrap = $('.sky-wrap', el);
    ios.push(onVisible(wrap, v => { if (SK) SK.visible = v; }, { once: false, threshold: 0 }));
    ios.push(onVisible(wrap, () => {
      if (SK && SK.rise === null) SK.rise = performance.now();
      el.querySelectorAll<HTMLElement>('[data-count]').forEach(b => countUp(b, +b.dataset.count!));
    }, { threshold: 0.2 }));

    // The slabs drop in over a couple of seconds and the fold takes under one; after that the
    // picture only changes with the pointer or the picked day.
    const riseMs = Math.max(1700 + SK.maxN * 70 + 460, 2700) + 100;
    const loop = (now: number) => {
      if (SK?.visible) {
        const moving = (SK.rise !== null && now - SK.rise < riseMs) || now - SK.lift.t0 < 1000;
        const key = `${SK.sel}|${SK.hover}|${SK.rise === null}|${SK.W}x${SK.H}`;
        if (moving || key !== SK.drawn) { draw(now); SK.drawn = moving ? '' : key; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function renderFacts(D: Story) {
    const { days, byDay, biggest } = D;
    const total = Math.floor((SK!.end - SK!.jan1) / DAY) + 1;
    let gap = { n: 0, from: '', to: '' }, run = 1, best = days.length ? 1 : 0;
    for (let i = 1; i < days.length; i++) {
      const diff = (utc(days[i]) - utc(days[i - 1])) / DAY;
      if (diff - 1 > gap.n) gap = { n: diff - 1, from: iso(utc(days[i - 1]) + DAY), to: iso(utc(days[i]) - DAY) };
      run = diff === 1 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    const stat = (n: number, cap: string, extra = '') => `<div class="stat"><b><span data-count="${n}">0</span>${extra}</b><span>${cap}</span></div>`;
    $('.sky-stats', el).innerHTML =
      stat(days.length, 'days with a new record', `<small> / ${total}</small>`) +
      stat(byDay.get(biggest)!.length, `records on ${longDate(biggest)}, the biggest day`) +
      stat(gap.n, gap.n ? `days without one, ${shortDate(gap.from)} – ${shortDate(gap.to)}` : 'days without a new record') +
      stat(best, best === 1 ? 'day in a row, at most' : 'days in a row with a new record');
  }

  function renderStrip() {
    if (!SK || !data) return;
    const list = data.byDay.get(SK.sel) ?? [];
    $('.sky-strip', el).innerHTML = `
      <p class="sky-when">${longDate(SK.sel)} <span>${plural(list.length, 'record')}</span></p>
      <div class="sky-row">${list.map(r => sleeve(r)).join('')}</div>`;
  }

  function layout() {
    if (!SK) return;
    const wrap = $('.sky-wrap', el), cv = $<HTMLCanvasElement>('canvas', el);
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
    Object.assign(SK, { W: width, H, x0: 26, y0: H - 30, dpr });
    draw(performance.now());
  }

  function liftAt(now: number) {
    const { from, to, t0 } = SK!.lift;
    return from + (to - from) * easeInOut(reduced() ? 1 : (now - t0) / 900);
  }

  // 0..1 progress of a slab dropping in: a wave from January to December, slabs stacking in order.
  function slabE(i: number, j: number, now: number) {
    if (SK!.rise === null) return 0;
    return clamp((now - SK!.rise - (i / SK!.n) * 1700 - j * 70) / 460, 0, 1);
  }

  function draw(now: number) {
    if (!SK || !data) return;
    const D = data;
    const { ctx, dpr, c, s, t, x0, y0, W, H, jan1, off, n, end } = SK;
    const L = liftAt(now);
    const dvx = 0.72 * c * L, dvy = -c + 0.42 * c * L;
    const dX = dvx * (s / c), dY = dvy * (s / c);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    SK.hulls = [];

    ctx.font = '600 10px "JetBrains Mono Variable", "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(251,247,239,.5)';
    ctx.textAlign = 'left';
    MONTHS.forEach((m, k) => {
      const w = Math.floor(((Date.UTC(D.year, k, 1) - jan1) / DAY + off) / 7);
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

    let big: Hull | null = null, selH: Hull | null = null;
    for (let k = 6; k >= 0; k--) {
      const dow = 6 - k;
      for (let w = 0; w < SK.weeks; w++) {
        const i = w * 7 + dow - off;
        if (i < 0 || i >= n) continue;
        const tday = jan1 + i * DAY, day = iso(tday), list = D.byDay.get(day);
        const bx = x0 + w * c + k * dvx, by = y0 + k * dvy;
        const floor: Pt[] = [[bx, by], [bx + s, by], [bx + s + dX, by + dY], [bx + dX, by + dY]];
        if (tday > end) {
          ctx.strokeStyle = 'rgba(251,247,239,.08)';
          outline(ctx, floor);
          continue;
        }
        poly(ctx, floor, 'rgba(251,247,239,.06)');
        if (!list) continue;

        let z = 0;
        if (L < 0.25) {
          ctx.globalAlpha = slabE(i, 0, now);
          list.forEach((r, j) => {
            const u0 = j / list.length, u1 = (j + 1) / list.length;
            poly(ctx, [[bx + s * u0, by], [bx + s * u1, by], [bx + s * u1 + dX, by + dY], [bx + s * u0 + dX, by + dY]], r.c.flood || '#888');
          });
          ctx.globalAlpha = 1;
        } else {
          list.forEach((r, j) => {
            const e = slabE(i, j, now);
            if (e <= 0) return;
            const h = t * L, zz = z + (1 - e) * 90, col = r.c.flood || '#888888';
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
        const pts: Pt[] = z > 0
          ? [[bx, by], [bx + s, by], [bx + s + dX, by + dY], [bx + s + dX, by + dY - z], [bx + dX, by + dY - z], [bx, by - z]]
          : floor;
        const hull: Hull = { day, pts, top: [bx + s / 2 + dX / 2, by + dY / 2 - z] };
        SK.hulls.push(hull);
        if (day === D.biggest) big = hull;
        if (day === SK.sel) selH = hull;
      }
    }

    const hov = SK.hover ? SK.hulls.find(x => x.day === SK!.hover) ?? null : null;
    for (const [h, colr] of [[selH, '#fbf7ef'], [hov, 'rgba(251,247,239,.6)']] as const) {
      if (!h) continue;
      ctx.strokeStyle = colr;
      ctx.lineWidth = 1.5;
      outline(ctx, h.pts);
    }

    if (big && L > 0.5 && slabE(0, 0, now) > 0) {
      const a = reduced() ? 1 : clamp((now - (SK.rise ?? now) - 2200) / 500, 0, 1);
      const [tx, ty] = (big as Hull).top, ly = ty - 30;
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#e9a23b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, ty - 4); ctx.lineTo(tx, ly); ctx.stroke();
      ctx.fillStyle = '#e9a23b';
      ctx.beginPath(); ctx.arc(tx, ty - 4, 2.5, 0, Math.PI * 2); ctx.fill();
      const label = `${shortDate(D.biggest).toUpperCase()} · ${D.byDay.get(D.biggest)!.length} RECORDS`;
      ctx.font = '600 11px "JetBrains Mono Variable", "JetBrains Mono", monospace';
      ctx.textAlign = tx > W - 140 ? 'right' : tx < 140 ? 'left' : 'center';
      ctx.fillStyle = '#fbf7ef';
      ctx.fillText(label, tx, ly - 6);
      ctx.globalAlpha = 1;
    }
  }

  return {
    render(d) {
      data = d;
      stop();
      build(d);
    },
    dispose() {
      stop();
      clearTimeout(rz);
      bus.removeEventListener('day', onDay);
      removeEventListener('resize', onResize);
      tip.remove();
      SK = null;
    },
  };
}
