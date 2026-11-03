// A1 · Sleeve by sleeve: every record of the year side by side in the order it came in, each cut to
// a sliver of its cover. The slivers near the pointer open up, Dock-style, to the full sleeve;
// left alone, the opening drifts through the year by itself.
import { $, bus, clamp, esc, head, longDate, MONTHS, onVisible, reduced, type Chapter, type Release, type Story } from '../core';

const AUTO_MS = 190; // per record when drifting on its own
const IDLE_MS = 2500; // how long after the pointer leaves before the drift picks up again
const BATCH = 8; // sleeves fetched per tick while the strip is on screen

const fmtRt = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);

export default function record(el: HTMLElement): Chapter {
  let D: Story | null = null, R: Release[] = [], bars: HTMLAnchorElement[] = [], N = 0;
  let W = 0, H = 0, SIG = 1.4, K = 0;
  let f = 0, tf = 0, front = -1, over = false, quietSince = 0, auto = !reduced(), visible = false, holdUntil = 0;
  let raf = 0, last = performance.now(), lastFetch = 0;

  el.innerHTML = `
    <div class="wrap"><div class="bc-head"></div></div>
    <div class="bc-stage">
      <div class="bc"></div>
      <div class="bc-months"></div>
    </div>
    <div class="wrap bc-info">
      <div class="bc-now" aria-live="polite"></div>
      <button class="pill sm bc-auto" aria-pressed="true">Drift through the year</button>
    </div>`;
  const strip = $('.bc', el);

  const setAuto = (on: boolean) => {
    auto = on;
    quietSince = 0;
    $('.bc-auto', el).setAttribute('aria-pressed', String(on));
  };
  const onMove = (e: PointerEvent) => {
    over = true;
    tf = solve(e.clientX - strip.getBoundingClientRect().left);
  };
  const onLeave = () => { over = false; quietSince = performance.now(); };
  const onResize = () => { if (D) { measure(); layout(); } };
  const onPlay = () => {
    scrollTo({ top: el.getBoundingClientRect().top + scrollY - 60, behavior: reduced() ? 'auto' : 'smooth' });
    setAuto(true);
  };
  strip.addEventListener('pointermove', onMove);
  strip.addEventListener('pointerleave', onLeave);
  $('.bc-auto', el).addEventListener('click', () => setAuto(!auto));
  addEventListener('resize', onResize);
  bus.addEventListener('play', onPlay);
  const io = onVisible(el, v => { visible = v; }, { once: false, threshold: 0.3 });

  /* ---------- the fisheye ---------- */
  function measure() {
    W = strip.clientWidth;
    const narrow = W < 700;
    SIG = narrow ? 0.7 : 1.05;
    // Keep the opened part to about half the strip so the rest of the year still reads as a barcode.
    H = Math.round(Math.min(W * 0.5 / (SIG * Math.sqrt(Math.PI)), innerHeight * 0.52, 440));
    // Bulge height chosen so the bar in focus comes out exactly square (a whole sleeve).
    K = Math.max(0, (H * N - W) / (W - H * SIG * Math.sqrt(Math.PI)));
    el.style.setProperty('--h', `${H}px`);
  }

  function widths(fc: number) {
    const w = new Float64Array(N);
    let sum = 0;
    for (let i = 0; i < N; i++) { const d = (i - fc) / SIG; w[i] = 1 + K * Math.exp(-d * d); sum += w[i]; }
    const u = W / sum;
    for (let i = 0; i < N; i++) w[i] *= u;
    return w;
  }

  // Where the middle of a (fractional) focus position lands once the bulge is applied.
  function centreAt(fc: number) {
    const w = widths(fc), i0 = Math.floor(fc);
    let x = 0;
    for (let i = 0; i < i0; i++) x += w[i];
    const c0 = x + w[i0] / 2;
    if (i0 >= N - 1) return c0;
    return c0 + (fc - i0) * (w[i0] / 2 + w[i0 + 1] / 2);
  }

  // The focus that puts the open sleeve right under x, so it never slides out from under the pointer.
  function solve(x: number) {
    let lo = 0, hi = N - 1;
    for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (centreAt(mid) < x) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  function load(i: number) {
    const img = bars[i]?.firstElementChild as HTMLImageElement | null;
    if (img?.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
  }

  function layout() {
    if (!N) return;
    const w = widths(f);
    const pos = new Float64Array(N);
    let x = 0;
    for (let i = 0; i < N; i++) {
      pos[i] = x;
      bars[i].style.width = `${w[i]}px`;
      if (w[i] > 12) load(i);
      x += w[i];
    }
    // Month labels ride along with the bulge; any that would collide with the one before are hidden.
    let lastX = -Infinity;
    for (const s of el.querySelectorAll<HTMLElement>('.bc-months span')) {
      const px = pos[+s.dataset.i!];
      s.style.transform = `translateX(${px}px)`;
      const fits = px - lastX > 40;
      s.style.opacity = fits ? '1' : '0';
      if (fits) lastX = px;
    }
    const k = clamp(Math.round(f), 0, N - 1);
    if (k !== front) {
      bars[front]?.classList.remove('on');
      front = k;
      bars[front].classList.add('on');
      show();
    }
  }

  function frame(now: number) {
    const dt = Math.min(100, now - last);
    last = now;
    if (D && N) {
      if (auto && visible && !over && now - quietSince > IDLE_MS && now > holdUntil) {
        tf += dt / AUTO_MS;
        // Hold on the last record, then sweep back to January.
        if (tf >= N - 1) {
          const atEnd = f >= N - 1.02;
          tf = atEnd ? 0 : N - 1;
          holdUntil = now + (atEnd ? 300 : 2500);
        }
      }
      const diff = tf - f;
      if (Math.abs(diff) > 1e-4) {
        f = reduced() ? tf : f + diff * (1 - Math.exp(-dt / 90));
        layout();
      }
      // The slivers start as sleeve colours and fill in with their covers while the strip is on screen.
      if (visible && now - lastFetch > 400) {
        lastFetch = now;
        let n = 0;
        for (let i = 0; i < N && n < BATCH; i++) {
          const img = bars[i].firstElementChild as HTMLImageElement;
          if (img.dataset.src) { load(i); n++; }
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  /* ---------- what's open ---------- */
  function show() {
    const r = R[front];
    el.style.setProperty('--flood', r.c.flood || '#e9a23b');
    const v = r.vc[0], fam = D!.families.find(x => x.key === r.fam);
    const chips = [
      r.y && r.y !== D!.year ? `${r.y} original` : r.y ? 'New release' : null,
      fam ? `<i style="background:${D!.famColour[r.fam]}"></i>${esc(fam.name)}` : null,
      v ? `<i style="background:${v.hex[0]}"></i>${esc(v.n)}` : '<i style="background:#0d0c0c"></i>Black vinyl',
      r.discs > 1 ? `${r.discs} × ${r.size}` : r.size,
      r.rt ? fmtRt(r.rt) : null,
      r.lab ? esc(r.lab.replace(/\s*\(\d+\)$/, '')) : null,
    ].filter(Boolean);
    $('.bc-now', el).innerHTML = `
      <div class="bc-when"><b>${new Date(r.d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</b><span>${longDate(r.d).split(' ')[0]} · ${front + 1} of ${N}</span></div>
      <div class="bc-what">
        <h3>${esc(r.t)}</h3>
        <p>${esc(r.by)}</p>
        <div class="now-chips">${chips.map(c => `<span>${c}</span>`).join('')}</div>
      </div>`;
  }

  return {
    render(story: Story) {
      D = story;
      R = story.releases;
      N = R.length;
      $('.bc-head', el).innerHTML = head('A1', 'Sleeve by sleeve', `${story.year}, sleeve by sleeve`,
        `All ${N} records in the order they came in, each cut to a sliver of its cover. Move along the line to open one up; leave it alone and it drifts through the year.`);
      strip.classList.remove('in');
      strip.innerHTML = R.map((r, i) => `<a class="bar" href="/album/${r.s}/" style="--i:${i};background:${r.c.flood || '#333'}"><img data-src="${r.img}" alt="${esc(r.t)} — ${esc(r.by)}" decoding="async"></a>`).join('');
      bars = [...strip.children] as HTMLAnchorElement[];
      const firsts: number[] = [];
      R.forEach((r, i) => { const m = +r.d.slice(5, 7) - 1; if (firsts[m] == null) firsts[m] = i; });
      $('.bc-months', el).innerHTML = firsts.map((i, m) => (i == null ? '' : `<span data-i="${i}">${MONTHS[m]}</span>`)).join('');
      f = tf = 0; front = -1; holdUntil = 0;
      measure();
      layout();
      requestAnimationFrame(() => strip.classList.add('in'));
    },
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      bus.removeEventListener('play', onPlay);
      io.disconnect();
      el.innerHTML = '';
    },
  };
}
