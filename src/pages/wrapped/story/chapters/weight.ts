import { $, clamp, countUp, ease, esc, head, MONTHS, onVisible, plural, reduced, type Chapter, type Release, type Story } from '../core';
import type { StoryVinyl } from '@/types/wrappedStory';

// How much vinyl: every disc stacked flat to scale, and the year's run time as one long reel.
type Timed = Release & { rt: number };
interface Disc { r: Release; k: number; mm: number; w: number; vc: StoryVinyl | undefined }
interface Hit { y0: number; y1: number; x0: number; x1: number; d: Disc }
interface Seg { r: Timed; x: number; y: number; w: number; start: number }
interface Part { layout(): void; start(): void; draw(now: number): void }
interface Pile { m: number; discs: Disc[]; mm: number }

const WIDTH_MM: Record<string, number> = { '12"': 302, '10"': 250, '7"': 175 };
const SIDE_MIN: Record<string, number> = { '12"': 21, '10"': 13, '7"': 4 };
const SLEEVE_MM = 314;
const TILT = 0.24; // how far we look down on the pile: an ellipse's height over its width
const LABEL_MM = 100;
// A steady wobble per disc, so the pile never looks machined.
const wobble = (i: number) => Math.sin(i * 12.9898) * 43758.5453 % 1;
const MONO = '600 10px "JetBrains Mono Variable", "JetBrains Mono", monospace';
const dur = (s: number) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
const recTip = (r: Release, extra: string) => `<div class="wt-tip"><img src="${r.img}" alt=""><div><b>${esc(r.t)}</b>${esc(r.by)}<br><span>${extra}</span></div></div>`;

export default function weight(el: HTMLElement): Chapter {
  let ios: IntersectionObserver[] = [], raf = 0, rz = 0, parts: Part[] = [];
  const tip = Object.assign(document.createElement('div'), { className: 'ws-tip' });
  document.body.append(tip);
  const onResize = () => { clearTimeout(rz); rz = window.setTimeout(() => parts.forEach(p => p.layout()), 150); };
  addEventListener('resize', onResize);

  function showTip(e: PointerEvent, html: string) {
    tip.innerHTML = html;
    tip.style.left = (e.clientX + 300 > innerWidth ? e.clientX - 300 : e.clientX + 16) + 'px';
    tip.style.top = e.clientY + 14 + 'px';
    tip.classList.add('on');
  }
  const hideTip = () => tip.classList.remove('on');

  function stop() {
    ios.forEach(io => io.disconnect());
    ios = [];
    cancelAnimationFrame(raf);
    parts = [];
  }

  // One pile per month, side by side: heights to scale against the ruler, widths squeezed to fit twelve.
  function setupStack(cv: HTMLCanvasElement, piles: Pile[]): Part {
    const ctx = cv.getContext('2d')!;
    const art = piles.map(p => {
      const top = p.discs.at(-1);
      if (!top) return null;
      const img = new Image();
      img.src = top.r.img;
      return img;
    });
    const total = piles.reduce((a, p) => a + p.discs.length, 0);
    const maxMM = Math.max(1, ...piles.map(p => p.mm));
    const span = Math.min(3600, 1200 + total * 7);
    let t0: number | null = null, done = false, dirty = true, rects: Hit[] = [];
    let W = 0, H = 0, dpr = 1, kv = 1, kw = 1, slot = 0, base = 0;
    const LM = 44;

    cv.addEventListener('pointermove', e => {
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      // Front-most first: the last drawn disc in a pile sits on top.
      const hit = [...rects].reverse().find(r => y >= r.y0 - 0.5 && y <= r.y1 + 0.5 && x >= r.x0 && x <= r.x1);
      if (!hit) { hideTip(); return; }
      const d = hit.d;
      showTip(e, recTip(d.r, `${d.r.discs > 1 ? `Disc ${d.k + 1} of ${d.r.discs} · ` : ''}${d.r.size}${d.vc ? ` · ${esc(d.vc.n)}` : ''}`));
    });
    cv.addEventListener('pointerleave', hideTip);

    return {
      layout() {
        // Phones scroll the piles sideways rather than squash them to slivers.
        W = Math.max(cv.parentElement!.clientWidth, 640);
        H = clamp(innerHeight * 0.62, 340, 560);
        dpr = devicePixelRatio || 1;
        cv.width = W * dpr; cv.height = H * dpr;
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        slot = (W - LM) / 12;
        const w12 = Math.min(slot * 0.84, 180);
        kw = w12 / 302;
        base = H - 40;
        // Capped so a quiet year's piles don't turn into bricks.
        kv = Math.min((base - 40 - (w12 / 2) * TILT) / maxMM, 6);
        dirty = true;
      },
      start() { if (t0 === null) t0 = reduced() ? -1e9 : performance.now(); },
      draw(now) {
        if (done && !dirty) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // Ruler: about five lines, in whole centimetres.
        const stepCM = [1, 2, 5, 10, 20, 50].find(c => (maxMM / 10) / c <= 5) ?? 50;
        ctx.font = MONO;
        ctx.textAlign = 'right';
        for (let cm = 0; cm * 10 <= maxMM + 0.01; cm += stepCM) {
          const y = base - cm * 10 * kv;
          ctx.fillStyle = 'rgba(251,247,239,.4)';
          ctx.fillText(`${cm}`, LM - 12, y + 3);
          ctx.fillStyle = 'rgba(251,247,239,.1)';
          ctx.fillRect(LM - 6, y, W - LM + 6, 1);
        }
        ctx.fillStyle = 'rgba(251,247,239,.4)';
        ctx.fillText('CM', LM - 12, 14);

        const t = t0 === null ? -1 : now - t0;
        let all = true, order = 0;
        rects = [];
        piles.forEach((p, m) => {
          const cx = LM + slot * (m + 0.5), fw = 302 * kw;
          const floor = ctx.createRadialGradient(cx, base, 0, cx, base, fw * 0.62);
          floor.addColorStop(0, 'rgba(0,0,0,.6)');
          floor.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = floor;
          ctx.beginPath(); ctx.ellipse(cx, base, fw * 0.62, fw * TILT * 0.62, 0, 0, Math.PI * 2); ctx.fill();

          let y = base, last: { cx: number; w: number; yy: number; d: Disc } | null = null, settled = true;
          p.discs.forEach(d => {
            const g = order++;
            const h = d.mm * kv;
            const e = t0 === null ? 0 : ease((t - (g / Math.max(1, total)) * span) / 380);
            if (e < 1) { all = false; settled = false; }
            if (e <= 0) { y -= h; return; }
            const w = d.w * kw, dx = cx + wobble(g) * w * 0.035, x = dx - w / 2, ry = (w / 2) * TILT;
            const yy = y - h - (1 - e) * (H * 0.5);
            const glass = d.vc?.glass, see = d.vc?.see;
            const body = d.vc ? (glass ? 'rgb(214,226,232)' : d.vc.hex[0]) : '#1b1a19';
            ctx.globalAlpha = Math.min(1, e * 2) * (glass ? 0.6 : see ? 0.85 : 1);
            // The edge: a band with a rounded bottom, lit from the left like a cylinder.
            ctx.fillStyle = body;
            ctx.beginPath();
            ctx.ellipse(dx, yy + h, w / 2, ry, 0, 0, Math.PI);
            ctx.lineTo(x, yy);
            ctx.ellipse(dx, yy, w / 2, ry, 0, Math.PI, 0, true);
            ctx.closePath();
            ctx.fill();
            const lit = ctx.createLinearGradient(x, 0, x + w, 0);
            lit.addColorStop(0, 'rgba(0,0,0,.55)');
            lit.addColorStop(0.28, 'rgba(255,255,255,.22)');
            lit.addColorStop(0.45, 'rgba(255,255,255,0)');
            lit.addColorStop(1, 'rgba(0,0,0,.6)');
            ctx.fillStyle = lit;
            ctx.fill();
            // A dark rim along the front edge, so each disc reads on its own in a run of the same colour.
            if (h > 2.5) {
              ctx.strokeStyle = 'rgba(0,0,0,.5)';
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.ellipse(dx, yy + h - 0.5, w / 2, ry, 0, 0.08, Math.PI - 0.08); ctx.stroke();
            }
            // The top face, which the next disc mostly covers.
            ctx.fillStyle = body;
            ctx.beginPath(); ctx.ellipse(dx, yy, w / 2, ry, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.06)';
            ctx.fill();
            ctx.globalAlpha = 1;
            rects.push({ y0: yy - ry, y1: yy + h + ry * 0.2, x0: x, x1: x + w, d });
            last = { cx: dx, w, yy, d };
            y -= h;
          });

          // The record on top: grooves, a sheen and its sleeve as the centre label.
          if (last) {
            const { cx: lx, w, yy, d } = last as { cx: number; w: number; yy: number; d: Disc };
            const ry = (w / 2) * TILT, img = art[m];
            ctx.save();
            ctx.beginPath(); ctx.ellipse(lx, yy, w / 2, ry, 0, 0, Math.PI * 2); ctx.clip();
            ctx.strokeStyle = d.vc && !d.vc.glass ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.08)';
            ctx.lineWidth = 1;
            for (let f = 0.96; f > LABEL_MM / d.w; f -= 0.06) {
              ctx.beginPath(); ctx.ellipse(lx, yy, (w / 2) * f, ry * f, 0, 0, Math.PI * 2); ctx.stroke();
            }
            const sheen = ctx.createLinearGradient(lx - w / 2, yy - ry, lx + w / 2, yy + ry);
            sheen.addColorStop(0.3, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.5, 'rgba(255,255,255,.16)');
            sheen.addColorStop(0.7, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen;
            ctx.fillRect(lx - w / 2, yy - ry, w, ry * 2);
            const lw = (LABEL_MM / d.w) * (w / 2);
            ctx.beginPath(); ctx.ellipse(lx, yy, lw, lw * TILT, 0, 0, Math.PI * 2); ctx.clip();
            if (img?.complete && img.naturalWidth) ctx.drawImage(img, lx - lw, yy - lw * TILT, lw * 2, lw * 2 * TILT);
            else { ctx.fillStyle = d.r.c.flood || '#888'; ctx.fill(); }
            ctx.restore();
            ctx.fillStyle = '#0b0a09';
            ctx.beginPath(); ctx.ellipse(lx, yy, w * 0.014, w * 0.014 * TILT, 0, 0, Math.PI * 2); ctx.fill();
            if (settled) {
              ctx.textAlign = 'center';
              ctx.fillStyle = '#e9a23b';
              ctx.fillText(`${(p.mm / 10).toFixed(1)} cm`, cx, yy - ry - 10);
            }
          }

          ctx.textAlign = 'center';
          ctx.fillStyle = p.discs.length ? 'rgba(251,247,239,.75)' : 'rgba(251,247,239,.3)';
          ctx.fillText(MONTHS[m].toUpperCase(), cx, base + 22);
          ctx.fillStyle = 'rgba(251,247,239,.4)';
          ctx.fillText(p.discs.length ? plural(p.discs.length, 'disc') : '—', cx, base + 35);
        });
        done = all;
        dirty = !all || art.some(img => img && !img.complete);
      },
    };
  }

  function setupReel(cv: HTMLCanvasElement, timed: Timed[], total: number): Part {
    const ctx = cv.getContext('2d')!;
    let t0: number | null = null, finished = false, segs: Seg[] = [];
    let W = 0, H = 0, dpr = 1, rowH = 24, gap = 12, lm = 44, pps = 1, rows = 9;

    cv.addEventListener('pointermove', e => {
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const s = segs.find(s => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + rowH);
      if (!s) { hideTip(); return; }
      showTip(e, recTip(s.r, `${dur(s.r.rt)} · ${plural(s.r.tracks, 'track')}`));
    });
    cv.addEventListener('pointerleave', hideTip);

    return {
      layout() {
        W = cv.parentElement!.clientWidth;
        rows = W < 600 ? 14 : 9; rowH = W < 600 ? 18 : 24; gap = 12; lm = 44;
        H = rows * (rowH + gap) + 6;
        dpr = devicePixelRatio || 1;
        cv.width = W * dpr; cv.height = H * dpr;
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        pps = ((W - lm) * rows) / total;
        // Lay segments along rows, splitting any that run past a row end.
        segs = [];
        let x = 0, row = 0;
        for (const r of timed) {
          let left = r.rt * pps;
          while (left > 0.01) {
            const room = W - lm - x, w = Math.min(left, room);
            segs.push({ r, x: lm + x, y: row * (rowH + gap), w, start: (row * (W - lm) + x) / pps });
            x += w; left -= w;
            if (x >= W - lm - 0.01) { x = 0; row++; }
          }
        }
        finished = false;
      },
      start() { if (t0 === null) t0 = reduced() ? -1e9 : performance.now(); },
      draw(now) {
        if (t0 === null || finished) return;
        const reach = ease((now - t0) / 2600) * total;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.font = MONO;
        ctx.textAlign = 'right';
        for (let row = 0; row < rows; row++) {
          const y = row * (rowH + gap);
          ctx.fillStyle = 'rgba(251,247,239,.07)';
          ctx.fillRect(lm, y, W - lm, rowH);
          ctx.fillStyle = 'rgba(251,247,239,.45)';
          ctx.fillText(`${Math.round((row * (W - lm)) / pps / 3600)}H`, lm - 8, y + rowH / 2 + 4);
        }
        for (const s of segs) {
          if (s.start > reach) break;
          const w = Math.min(s.w, (reach - s.start) * pps);
          ctx.fillStyle = s.r.c.flood || '#888';
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
        if (reach >= total) finished = true;
      },
    };
  }

  return {
    render(data: Story) {
      stop();
      hideTip();
      const recs = data.releases;
      const discs = recs.reduce((a, r) => a + r.discs, 0);
      const grams = recs.reduce((a, r) => a + r.g_wt, 0);
      const timed = recs.filter((r): r is Timed => !!r.rt);
      const known = timed.reduce((a, r) => a + r.rt, 0);
      const est = recs.filter(r => !r.rt).reduce((a, r) => a + r.discs * 2 * (SIDE_MIN[r.size] ?? 21) * 60, 0);
      const hours = (known + est) / 3600;

      // One entry per disc, in the order they came in.
      const pile: Disc[] = recs.flatMap(r => Array.from({ length: r.discs }, (_, k) => ({
        r, k, mm: 0.9 + (r.g_wt / r.discs) * 0.006, w: WIDTH_MM[r.size] ?? 302, vc: r.vc[k] || r.vc[0],
      })));
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
          <div class="wt-pile-head">
            <div>
              <p class="label">Stacked flat, in one pile</p>
              <p class="wt-big"><span data-count="${stackMM / 10}" data-dp="0">0</span> cm</p>
            </div>
            <p class="wt-sub">That's ${(stackMM / SLEEVE_MM).toFixed(1)} record sleeves high. Here it is a month at a time, heights to scale, with each month's last record on top. Hover a disc to see which record it is.</p>
          </div>
          <div class="wt-stage"><canvas class="wt-stack"></canvas></div>
        </div>
        ${timed.length ? `<div class="wt-reel-head">
          <p class="label">End to end · ${dur(known)}</p>
          <p class="wt-sub">Each bar is one record, as long as its run time, in the order they were added.</p>
        </div>
        <div class="wt-reel-wrap"><canvas class="wt-reel"></canvas></div>
        <div class="wt-ends">
          ${([['Longest', longest], ['Shortest', shortest]] as const).map(([k, r]) => `<a class="wt-end" href="/album/${r.s}/">
            <img src="${r.img}" alt="">
            <div><p class="label">${k}</p><b>${esc(r.t)}</b><span>${esc(r.by)}</span><em>${dur(r.rt)} · ${plural(r.tracks, 'track')}</em></div>
          </a>`).join('')}
        </div>` : ''}
      </div>`;

      const piles: Pile[] = MONTHS.map((_, m) => {
        const discs = pile.filter(d => +d.r.d.slice(5, 7) - 1 === m);
        return { m, discs, mm: discs.reduce((a, d) => a + d.mm, 0) };
      });
      const stack = setupStack($<HTMLCanvasElement>('.wt-stack', el), piles);
      const reel = timed.length ? setupReel($<HTMLCanvasElement>('.wt-reel', el), timed, known) : null;
      parts = reel ? [stack, reel] : [stack];
      parts.forEach(p => p.layout());

      ios.push(onVisible($('.wt-stats', el), () => {
        el.querySelectorAll<HTMLElement>('[data-count]').forEach(b => {
          const dp = b.dataset.dp;
          countUp(b, +b.dataset.count!, dp ? { fmt: n => n.toFixed(+dp === 0 ? 0 : 1) } : {});
        });
      }, { threshold: 0.3 }));
      ios.push(onVisible($('.wt-stage', el), () => stack.start(), { threshold: 0.2 }));
      if (reel) ios.push(onVisible($('.wt-reel-wrap', el), () => reel.start(), { threshold: 0.2 }));

      const loop = (now: number) => {
        parts.forEach(p => p.draw(now));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    },
    dispose() {
      stop();
      clearTimeout(rz);
      removeEventListener('resize', onResize);
      tip.remove();
    },
  };
}
