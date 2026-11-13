// Shared state and helpers for the Wrapped story chapters (/wrapped/:year).
// Each chapter is chapters/<id>.ts: a factory that takes its <section> and returns
// { render(story), dispose() }. WrappedStory.tsx mounts them and feeds them the year.
import { GENRE_FAMILIES, type GenreFamilyKey } from '@/lib/genreFamilyDefs';
import { getAlbumImageUrl, getArtistAvatarUrl, getArtistFanartFromData, getArtistImageUrl } from '@/lib/image-utils';
import type { WrappedData } from '@/types/wrapped';
import type { StoryArtist, StoryLink, StoryRelease } from '@/types/wrappedStory';

export interface Release extends StoryRelease {
  /** Medium sleeve URL */
  img: string;
}
export interface Artist extends Omit<StoryArtist, 'fanart'> {
  avatar: string;
  photo: string;
  /** Fanart URL, when the artist has one */
  fanart: string | null;
}
export interface Story {
  year: number;
  ytd: boolean;
  summary: WrappedData['summary'];
  families: Array<{ key: GenreFamilyKey; code: string; name: string }>;
  releases: Release[];
  artists: Artist[];
  links: StoryLink[];
  outside: Array<{ s: string; name: string; avatar: string }>;
  perYear: Record<string, number>;
  perMonth: Record<string, number[]>;
  byDay: Map<string, Release[]>;
  days: string[];
  biggest: string;
  artistBySlug: Map<string, Artist>;
  famColour: Record<string, string>;
}
export interface Chapter {
  render(story: Story): void;
  dispose(): void;
}
export type ChapterFactory = (el: HTMLElement) => Chapter;

export const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s)!;
export const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DAY = 864e5;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const ymd = (s: string) => s.split('-').map(Number);
export const utc = (s: string) => { const [y, m, d] = ymd(s); return Date.UTC(y, m - 1, d); };
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const dim = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const longDate = (s: string) => new Date(utc(s)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const shortDate = (s: string) => new Date(utc(s)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t: number) => (t = clamp(t, 0, 1), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A sleeve tile linking to the album page. */
export const sleeve = (r: Release, cls = '') =>
  `<a class="slv ${cls}" href="/album/${r.s}/"><img loading="lazy" src="${r.img}" alt=""><b>${esc(r.t)}</b><span>${esc(r.by)}</span></a>`;

/** Chapter heading: track number (none when empty, as on /stats), label, display title and an optional lede. */
export const head = (track: string, label: string, title: string, lede = '') => `
  <div class="track label">${track ? `<span class="num">${track}</span>` : ''}<span>${esc(label)}</span></div>
  <h2 class="display">${title}</h2>${lede ? `<p class="lede">${lede}</p>` : ''}`;

/** Mix a hex colour toward white (k > 0) or black (k < 0). */
export function shade(hex: string | undefined, k: number) {
  const n = parseInt((hex || '#888888').slice(1), 16);
  const t = k > 0 ? 255 : 0, a = Math.abs(k);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - a) + t * a);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Run cb when el scrolls into view (once by default); cb(false) on leaving when once is false. */
export function onVisible(el: Element, cb: (visible: boolean) => void, { once = true, threshold = 0.2 } = {}) {
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
export function countUp(el: Element, to: number, { dur = 1400, fmt = (n: number) => Math.round(n).toLocaleString('en-GB') } = {}) {
  if (reduced()) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = ease((now - t0) / dur);
    el.textContent = fmt(to * k);
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Page-wide events between chapters and the page: `day` (a day picked in the
 * skyline), `play` (the cover's button) and `goto` (a path for the router).
 */
export const bus = new EventTarget();
export const state: { day: string | null } = { day: null };

export function selectDay(day: string, source: string) {
  state.day = day;
  bus.dispatchEvent(new CustomEvent('day', { detail: { day, source } }));
}
export const goToYear = (year: number) => bus.dispatchEvent(new CustomEvent('goto', { detail: `/wrapped/${year}` }));

/** The year's story with derived lookups and image URLs; null when the file has no story block. */
export function buildStory(data: WrappedData): Story | null {
  const raw = data.story;
  if (!raw?.releases.length) return null;
  const releases: Release[] = raw.releases.map(r => ({ ...r, img: getAlbumImageUrl(r.s, 'medium') }))
    .sort((a, b) => a.d.localeCompare(b.d));
  const artists: Artist[] = raw.artists.map(a => ({
    ...a,
    avatar: getArtistAvatarUrl(a.s),
    photo: getArtistImageUrl(a.s, 'medium'),
    fanart: a.fanart ? getArtistFanartFromData(`/artist/${a.s}/`, a.fanart) : null,
  }));
  const byDay = new Map<string, Release[]>();
  for (const r of releases) byDay.set(r.d, [...(byDay.get(r.d) ?? []), r]);
  const days = [...byDay.keys()];
  const story: Story = {
    year: data.year,
    ytd: data.isYearToDate,
    summary: data.summary,
    families: GENRE_FAMILIES.map(({ key, code, name }) => ({ key, code, name })),
    releases,
    artists,
    links: raw.links,
    outside: raw.outside.map(o => ({ ...o, avatar: getArtistAvatarUrl(o.s) })),
    perYear: raw.perYear,
    perMonth: raw.perMonth ?? {},
    byDay,
    days,
    biggest: days.reduce((a, d) => (byDay.get(d)!.length > byDay.get(a)!.length ? d : a), days[0]),
    artistBySlug: new Map(artists.map(a => [a.s, a])),
    famColour: {},
  };
  story.famColour = familyColours(story);
  return story;
}

/** One colour per genre family, taken from that family's most vivid sleeves, kept apart in hue. */
function familyColours(story: Story) {
  const out: Record<string, string> = {}, used: number[] = [];
  const fallback = ['#e9a23b', '#c8553d', '#3c7bd8', '#5aa469', '#b05fc4', '#d9c24a', '#2fb5b0', '#e2708a', '#8b8f94', '#6f8fd8', '#c9a24a', '#7ac77a'];
  story.families.forEach((f, i) => {
    const cands = story.releases.filter(r => r.fam === f.key && r.c.flood && (r.c.vivid ?? 0) > 0.45)
      .sort((a, b) => (b.c.vivid ?? 0) - (a.c.vivid ?? 0));
    const pick = cands.find(r => used.every(h => Math.min(Math.abs(h - (r.c.hue ?? 0)), 1 - Math.abs(h - (r.c.hue ?? 0))) > 0.05));
    out[f.key] = pick?.c.flood ?? fallback[i];
    if (pick) used.push(pick.c.hue ?? 0);
  });
  return out;
}
