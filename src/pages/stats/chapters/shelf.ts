// The shelf: every record as a spine in its sleeve's colour, filed in the order it arrived and
// drawn to scale, with a divider at each year and a ruler in metres under every row. The years
// below carry their weight and running time; hovering one lights its run on the shelf.
import { countUp, head, onVisible, plural, reduced } from '../../wrapped/story/core';
import type { StatsRecord } from '@/types/stats';
import { n, onWidthChange, recordTip, tooltip, type StatsChapter, type StatsView } from '../kit';

/** A sleeve's spine on the shelf, in metres (the generator's figure for `totals.metres`). */
const SPINE_M = 0.0035;
/** A year divider takes this many spines' width. */
const DIVIDER = 2;
const PLAIN = ['#2b2a2e', '#333237', '#26252a'];

interface Slot { r: StatsRecord; i: number; row: number; x: number }
interface Divider { yr: string; row: number; x: number }

export default function shelf(el: HTMLElement): StatsChapter {
  const tip = tooltip();
  let stops: Array<() => void> = [];
  let current: StatsView | null = null;
  const cleanup = () => { stops.forEach(f => f()); stops = []; };
  const unwatch = onWidthChange(el, () => current && render(current));

  function render(v: StatsView) {
    cleanup();
    current = v;
    const recs = v.records;
    if (!recs.length) { el.innerHTML = ''; return; }
    const t = v.totals;
    const heaviest = v.piles.length ? v.piles.reduce((a, b) => (b.kg > a.kg ? b : a)) : null;

    el.innerHTML = `<div class="wrap">
      ${head('', 'Weight and length', 'End to end', `All ${plural(recs.length, 'record')} filed in the order they arrived, a spine each in its sleeve's colour, drawn to scale. Hover a spine for the record, or a year for its run.`)}
      <div class="stats st-stats">
        <div class="stat"><b><span data-n="${t.metres}" data-dp="1">0</span> m</b><span>of shelf, at 3.5 mm a sleeve</span></div>
        <div class="stat"><b><span data-n="${t.kg}">0</span> kg</b><span>of vinyl${heaviest ? `, ${heaviest.yr} the heaviest year at ${Math.round(heaviest.kg)} kg` : ''}</span></div>
        <div class="stat"><b><span data-n="${t.hours}">0</span> h</b><span>of music: ${Math.round(t.hours / 24)} days played back to back</span></div>
        <div class="stat"><b data-n="${t.tracks}">0</b><span>tracks across ${plural(t.discs, 'disc')}</span></div>
      </div>
      <div class="sh-shelf"><canvas role="img" aria-label="${plural(recs.length, 'record')} as spines along ${t.metres} metres of shelf, in the order they arrived"></canvas></div>
      <div class="sh-years">${v.piles.map(p => `
        <div class="sh-year" data-yr="${p.yr}">
          <b>${p.yr}</b>
          <span>${plural(p.records, 'record')} · ${(p.records * SPINE_M).toFixed(1)} m</span>
          <span>${Math.round(p.kg)} kg · ${n(p.hours)} h</span>
        </div>`).join('')}
      </div>
    </div>`;

    const box = el.querySelector<HTMLElement>('.sh-shelf')!;
    const canvas = box.querySelector('canvas')!;
    const W = box.clientWidth, narrow = W < 640, dpr = devicePixelRatio || 1;
    const years = [...new Set(recs.map(r => r.d.slice(0, 4)))];
    const units = recs.length + years.length * DIVIDER;
    const rows = Math.max(1, Math.ceil((units * (narrow ? 1.5 : 2.6)) / W));
    // A whole number of device pixels per spine, so every edge is crisp; then as many as fit.
    const sw = Math.max(1, Math.floor((W * dpr) / Math.ceil(units / rows))) / dpr;
    const perRow = Math.floor(W / sw);
    const top = 18, spineH = narrow ? 30 : 50, board = 3, ruler = 18, rowH = top + spineH + board + ruler;

    // Lay the spines out; a divider opens each year and never sits last on a row.
    const slots: Slot[] = [], dividers: Divider[] = [];
    let row = 0, col = 0, yr = '';
    const step = (w: number) => { if (col + w > perRow) { row++; col = 0; } const x = col * sw; col += w; return x; };
    recs.forEach((r, i) => {
      const y = r.d.slice(0, 4);
      if (y !== yr) {
        yr = y;
        if (col + DIVIDER + 1 > perRow) { row++; col = 0; }
        dividers.push({ yr, row, x: step(DIVIDER) });
      }
      const x = step(1);
      slots.push({ r, i, row, x });
    });
    const usedRows = row + 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(usedRows * rowH * dpr);
    canvas.style.height = `${usedRows * rowH}px`;
    const ctx = canvas.getContext('2d')!;
    const css = getComputedStyle(box);
    const ink = css.getPropertyValue('--ink').trim() || '#fbf7ef';
    const amber = css.getPropertyValue('--amber').trim() || '#e9a23b';
    const mono = css.getPropertyValue('--mono').trim() || 'monospace';

    let lit: string | null = null, hover = -1, shown = reduced() ? slots.length : 0, raf = 0;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, usedRows * rowH);
      const gap = sw >= 2 ? 1 / dpr : 0;
      for (let k = 0; k < usedRows; k++) {
        const y = k * rowH + top + spineH;
        ctx.fillStyle = 'rgba(251,247,239,.22)';
        ctx.fillRect(0, y, W, board);
      }
      // The ruler: a tick every 10 cm under the spine that reaches it, a label every half metre.
      ctx.font = `600 10px ${mono}`;
      ctx.textBaseline = 'top';
      for (let cm = 0; cm * 0.1 <= recs.length * SPINE_M; cm++) {
        const s = slots[Math.min(slots.length - 1, Math.round((cm * 0.1) / SPINE_M))];
        const y = s.row * rowH + top + spineH + board, half = cm % 5 === 0;
        ctx.fillStyle = `rgba(251,247,239,${half ? 0.45 : 0.2})`;
        ctx.fillRect(s.x, y, 1, half ? 7 : 4);
        if (!half || (narrow && cm % 10)) continue;
        const text = `${cm / 10} m`, tw = ctx.measureText(text).width;
        ctx.fillText(text, Math.min(s.x + 4, W - tw), y + 6);
      }
      for (let k = 0; k < Math.min(shown, slots.length); k++) {
        const s = slots[k], y = s.row * rowH + top, lean = (s.i * 7) % 5;
        ctx.globalAlpha = lit && s.r.d.slice(0, 4) !== lit ? 0.16 : 1;
        ctx.fillStyle = s.r.f ?? PLAIN[s.i % 3];
        ctx.fillRect(s.x, y + lean, sw - gap, spineH - lean);
      }
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
      ctx.font = `700 11px ${mono}`;
      for (const d of dividers) {
        const y = d.row * rowH, on = !lit || lit === d.yr;
        ctx.globalAlpha = on ? 1 : 0.3;
        ctx.fillStyle = lit === d.yr ? amber : ink;
        ctx.fillRect(d.x, y + top - 6, Math.max(2, sw * DIVIDER - 1), spineH + 6);
        const tw = ctx.measureText(d.yr).width;
        ctx.fillText(d.yr, Math.min(d.x, W - tw), y + top - 9);
      }
      ctx.globalAlpha = 1;
      if (hover >= 0) {
        const s = slots[hover];
        ctx.strokeStyle = ink; ctx.lineWidth = 2;
        ctx.strokeRect(s.x - 1, s.row * rowH + top - 3, Math.max(sw, 3) + 2, spineH + 6);
      }
    };
    draw();

    // Rows hold their spines in x order, so a pointer finds its spine by row then column.
    const byRow: Slot[][] = Array.from({ length: usedRows }, () => []);
    slots.forEach(s => byRow[s.row].push(s));
    const find = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect(), px = e.clientX - b.left, py = e.clientY - b.top;
      const k = Math.floor(py / rowH), inRow = byRow[k];
      if (!inRow || py - k * rowH < top - 4 || py - k * rowH > top + spineH + board) return -1;
      const s = inRow.find(q => px >= q.x && px < q.x + sw);
      return s ? s.i : -1;
    };
    const setHover = (i: number) => { if (i !== hover) { hover = i; canvas.style.cursor = i >= 0 ? 'pointer' : ''; draw(); } };
    const date = (r: StatsRecord) => new Date(r.d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const onMove = (e: PointerEvent) => {
      const i = find(e);
      setHover(i);
      if (i < 0) return tip.hide();
      const r = slots[i].r;
      tip.show(e, () => recordTip(v, r, `added ${date(r)} · <span style="color:var(--amber)">${(i * SPINE_M).toFixed(2)} m</span> along the shelf`), r);
    };
    const onLeave = () => { setHover(-1); tip.hide(); };
    const onClick = (e: MouseEvent) => {
      const i = find(e as PointerEvent);
      if (i < 0) return;
      // A real link, so StatsStory's handler routes it like any other.
      const a = Object.assign(document.createElement('a'), { href: `/album/${slots[i].r.s}/`, hidden: true });
      box.append(a); a.click(); a.remove();
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);

    const yearsBox = el.querySelector<HTMLElement>('.sh-years')!;
    const light = (y: string | null) => { if (y !== lit) { lit = y; draw(); } };
    yearsBox.addEventListener('pointerover', e => light((e.target as Element).closest<HTMLElement>('.sh-year')?.dataset.yr ?? null));
    yearsBox.addEventListener('pointerleave', () => light(null));

    const io = onVisible(box, () => {
      el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!, b.dataset.dp ? { fmt: x => x.toFixed(1) } : {}));
      if (shown >= slots.length) return;
      // The shelf fills left to right, row by row.
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 1800);
        shown = Math.round(slots.length * (1 - (1 - k) ** 3));
        draw();
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.1 });
    stops.push(() => { io.disconnect(); cancelAnimationFrame(raf); tip.hide(); });
  }

  return { render, dispose: () => { cleanup(); unwatch(); tip.remove(); } };
}
