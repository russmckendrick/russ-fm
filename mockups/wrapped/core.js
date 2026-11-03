// Shared state and helpers for the Wrapped mockup chapters.
// Each chapter is chapters/<id>.js exporting { id, init(el), render(data) }; main.js wires them up.
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

export { d3 };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DAY = 864e5;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const ymd = s => s.split('-').map(Number);
export const utc = s => { const [y, m, d] = ymd(s); return Date.UTC(y, m - 1, d); };
export const iso = t => new Date(t).toISOString().slice(0, 10);
export const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const longDate = s => new Date(utc(s)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const shortDate = s => new Date(utc(s)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const plural = (n, one, many = one + 's') => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = t => (t = clamp(t, 0, 1), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A sleeve tile linking to the album page. */
export const sleeve = (r, cls = '') =>
  `<a class="slv ${cls}" href="/album/${r.s}/"><img loading="lazy" src="${r.img}" alt=""><b>${esc(r.t)}</b><span>${esc(r.by)}</span></a>`;

/** Chapter heading: track number, label, display title and an optional lede. */
export const head = (track, label, title, lede = '') => `
  <div class="track label"><span class="num">${track}</span><span>${esc(label)}</span></div>
  <h2 class="display">${title}</h2>${lede ? `<p class="lede">${lede}</p>` : ''}`;

/** Mix a hex colour toward white (k > 0) or black (k < 0). */
export function shade(hex, k) {
  const n = parseInt((hex || '#888888').slice(1), 16);
  const t = k > 0 ? 255 : 0, a = Math.abs(k);
  const ch = s => Math.round(((n >> s) & 255) * (1 - a) + t * a);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Run cb when el scrolls into view (once by default); cb(false) on leaving when once is false. */
export function onVisible(el, cb, { once = true, threshold = 0.2 } = {}) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) { cb(true); if (once) io.disconnect(); }
      else if (!once) cb(false);
    }
  }, { threshold });
  io.observe(el);
  return io;
}

/** Count an element's text up to a number. */
export function countUp(el, to, { dur = 1400, fmt = n => Math.round(n).toLocaleString('en-GB') } = {}) {
  if (reduced) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = now => {
    const k = ease((now - t0) / dur);
    el.textContent = fmt(to * k);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const state = { year: null, data: null, day: null };
export const bus = new EventTarget();

/** Share the selected day across chapters (the record, the skyline). */
export function selectDay(day, source) {
  state.day = day;
  bus.dispatchEvent(new CustomEvent('day', { detail: { day, source } }));
}

export async function loadYear(year) {
  const data = await (await fetch(`data/${year}.json`)).json();
  data.releases.sort((a, b) => a.d.localeCompare(b.d));
  data.byDay = new Map();
  for (const r of data.releases) data.byDay.has(r.d) ? data.byDay.get(r.d).push(r) : data.byDay.set(r.d, [r]);
  data.days = [...data.byDay.keys()];
  data.biggest = data.days.reduce((a, d) => (data.byDay.get(d).length > data.byDay.get(a).length ? d : a), data.days[0]);
  data.artistBySlug = new Map(data.artists.map(a => [a.s, a]));
  data.famColour = familyColours(data);
  state.year = year;
  state.data = data;
  state.day = null;
  bus.dispatchEvent(new CustomEvent('year', { detail: data }));
  return data;
}

/** One colour per genre family, taken from that family's most vivid sleeves, kept apart in hue. */
function familyColours(data) {
  const out = {}, used = [];
  const fallback = ['#e9a23b', '#c8553d', '#3c7bd8', '#5aa469', '#b05fc4', '#d9c24a', '#2fb5b0', '#e2708a', '#8b8f94', '#6f8fd8', '#c9a24a', '#7ac77a'];
  data.families.forEach((f, i) => {
    const cands = data.releases.filter(r => r.fam === f.key && r.c?.flood && (r.c.vivid ?? 0) > 0.45)
      .sort((a, b) => (b.c.vivid ?? 0) - (a.c.vivid ?? 0));
    const pick = cands.find(r => used.every(h => Math.min(Math.abs(h - r.c.hue), 1 - Math.abs(h - r.c.hue)) > 0.05));
    out[f.key] = pick ? pick.c.flood : fallback[i];
    if (pick) used.push(pick.c.hue);
  });
  return out;
}
