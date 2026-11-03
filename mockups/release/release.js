// Release room mockup: the album hero as a listening room, after /tv.
// The site's own pressing looks (marble, splatter, swirl…), so the platter matches the rest of russ.fm.
import { discLooks, pressingDiscs } from '/src/lib/vinylLook.ts';

const q = new URLSearchParams(location.search);
const ALBUMS = [
  'recovering-the-satellites-38020338',
  'greatest-hits-38885634',
  'mtv-unplugged-38515587',
  'ok-computer-oknotok-1997-2017-10229846',
  'blue-lines-9442778',
  'rumours-4288657',
];
// Patterned pressings from the collection, to try the platter with.
const PATTERNED = [
  'residue-26901554',
  'bright-magic-20338117',
  'ants-from-up-there-21932389',
  'live-from-the-nave-16206289',
  'free-all-angels-24515054',
  'hand-cannot-erase-34684266',
  'franz-ferdinand-29697511',
  'maps-of-non-existent-places-14780449',
  'load-23599586',
  'meantime-10471680',
  'no-one-is-lost-6214485',
];
const slug = q.get('album') || ALBUMS[0];
const zoom = Number(q.get('zoom') || 1.5);

const [album, colours, rooms] = await Promise.all([
  fetch(`/album/${slug}/${slug}.json`).then((r) => r.json()),
  fetch('/album-colors.json').then((r) => r.json()),
  fetch('assets/rooms.json').then((r) => r.json()),
]);

// Genre picks the room, like the genre rooms on /tv; ?room= overrides.
const GENRE_ROOM = { Rock: 'basement', Electronic: 'living', 'Hip Hop': 'basement', Jazz: 'living', Pop: 'daylight', 'Folk, World, & Country': 'daylight' };
const roomId = q.get('room') || GENRE_ROOM[album.genres?.[0]] || Object.keys(rooms)[0];
const room = rooms[roomId] || Object.values(rooms)[0];

const pal = colours[`/album/${slug}/`] || { flood: '#b26440', ground: '#1c1916' };
const lum = (hex) => {
  const c = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
// Same rule as inkOn() in src/lib/sleeveColour.ts: whichever of ink/cream contrasts more.
const ink = (lum(pal.flood) + 0.05) / (lum('#0e0d0c') + 0.05) >= (lum('#fbf7ef') + 0.05) / (lum(pal.flood) + 0.05) ? '#0e0d0c' : '#fbf7ef';
const root = document.documentElement.style;
root.setProperty('--flood', pal.flood);
root.setProperty('--ink', ink);
root.setProperty('--ground', pal.ground || '#1c1916');

// The platter holds disc 1, drawn by the site's vinylLook (black when it has none).
const look = discLooks(pressingDiscs(album.format_details, album.vinyl_colours))[0];
const vinylEl = document.getElementById('vinyl');
if (look) {
  vinylEl.style.setProperty('--vinyl-body', look.body);
  vinylEl.style.setProperty('--vinyl-pattern', look.pattern ?? 'none');
  vinylEl.style.setProperty('--vinyl-rim', look.rim);
}
// How brightly each room lights the record (by eye, from the photos).
const ROOM_LIGHT = { living: 1, basement: 0.85, daylight: 1.04 };
vinylEl.style.setProperty('--room-light', ROOM_LIGHT[roomId] ?? 1);

// ---- room ----
const $ = (id) => document.getElementById(id);
const roomEl = $('room');
const cover = `/album/${slug}/${slug}-hi-res.jpg`;
$('sleeve').querySelector('img').src = cover;
const roomSrc = `assets/${roomId}.webp`;
const roomMedium = `assets/${roomId}-medium.webp`;
$('roomImg').src = roomSrc;
$('roomImg').srcset = `${roomMedium} 3072w, ${roomSrc} 6144w`;
$('tint').style.cssText = `background:${pal.flood};-webkit-mask-image:url(${roomMedium});mask-image:url(${roomMedium})`;
$('vlabel').querySelector('img').src = cover;

const added = new Date(album.date_added);
$('sticker').innerHTML = `<small>Added</small><b>${added.getDate()} ${added.toLocaleString('en-GB', { month: 'short' })}</b><small>${added.getFullYear()}</small>`;

// Port of TvRoom's layout(): size the photo so the sleeve board is a sensible
// size for the box, centred a little above the middle, photo still covering the box.
function layout() {
  const w = roomEl.clientWidth;
  const fullH = roomEl.clientHeight;
  const inset = 72; // the see-through header
  const h = fullH - inset;
  const s = room.sleeve;
  const d = room.record;
  const target = Math.min(Math.max(w * 0.22 * zoom, Math.min(w * 0.6, 260)), 520 * zoom, h * 0.5 * zoom, h * 0.72);
  const width = Math.max(target / (s.width / 100), w, fullH * room.aspect);
  const height = width / room.aspect;
  // Frame the sleeve and the turntable together when both fit; else just the sleeve (phones).
  const span = ((d.x + d.rx - s.left) / 100) * width;
  const cx = (span < w * 0.94 ? (s.left + d.x + d.rx) / 2 : s.left + s.width / 2) / 100 * width;
  const cy = ((s.top + s.height / 2) / 100) * height;
  const left = Math.min(0, Math.max(w - width, w / 2 - cx));
  const top = Math.min(0, Math.max(fullH - height, inset + h * 0.46 - cy));
  const box = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
  for (const id of ['roomImg', 'tint']) {
    const el = $(id);
    el.style.cssText = el.style.cssText.replace(/left:[^;]+;top:[^;]+;width:[^;]+;height:[^;]+;?/, '') + ';' + box;
  }
  $('roomImg').sizes = `${Math.round(width)}px`;
  const bleed = 3;
  const sl = { x: left + (s.left / 100) * width - bleed, y: top + (s.top / 100) * height - bleed, w: (s.width / 100) * width + bleed * 2, h: (s.height / 100) * height + bleed * 2 };
  // The record: a circle round the spindle, big enough to fill the photo's
  // cut-out (the photo hides the rest), squashed into the turntable's perspective.
  const dw = 2 * d.cover * (d.rx / 100) * width;
  const squash = d.ry / d.rx / room.aspect;
  const [px, py] = [left + (d.x / 100) * width, top + (d.y / 100) * height];
  Object.assign(vinylEl.style, { left: `${px - dw / 2}px`, top: `${py - dw / 2}px`, width: `${dw}px`, height: `${dw}px`, transform: `scaleY(${squash})` });
  vinylEl.style.setProperty('--edge', `${100 / d.cover}%`);
  const lab = $('vlabel').style;
  lab.width = lab.height = `${(d.hole / d.cover) * 100}%`;
  lab.left = lab.top = `${50 - (d.hole / d.cover) * 50}%`;
  $('sleeve').style.cssText = `left:${sl.x}px;top:${sl.y}px;width:${sl.w}px;height:${sl.h}px`;
  const st = Math.max(64, Math.min(120, sl.w * 0.28));
  $('sticker').style.cssText = `left:${sl.x + sl.w - st * 0.62}px;top:${sl.y - st * 0.38}px;width:${st}px;height:${st}px;font-size:${st / 100}rem`;
}
new ResizeObserver(layout).observe(roomEl);

// ---- band ----
const fd = album.format_details?.[0] || {};
const discs = Number(fd.qty || 1);
const label = album.labels?.[0] || '';
$('kicker').textContent = [fd.descriptions?.[0] || 'LP', discs > 1 ? `${discs} discs` : null, album.vinyl_colours?.join(' / '), label, album.year, album.country].filter(Boolean).join(' · ');
$('title').textContent = album.title;
$('artist').textContent = album.artists.map((a) => a.name).join(' & ');
$('genres').textContent = [...(album.styles || []), ...(album.genres || [])].slice(0, 3).join(' · ');
const extras = [
  ['Spotify', 'S', album.spotify_url],
  ['Apple Music', 'A', album.apple_music_url],
  ['Discogs', 'D', album.discogs_url],
  [`Watch ${album.videos?.length || 0} videos`, 'TV', album.videos?.length ? '#' : null],
  ['Follow the thread', '⟿', '#'],
].filter((e) => e[2]);
$('extras').innerHTML = extras.map(([t, g, u]) => `<a class="icon-btn" href="${u}" title="${t}" aria-label="${t}">${g}</a>`).join('');

// Title fits a one-line box, like the TV band's FitTitle.
function fit() {
  const el = $('title');
  let size = 96;
  el.style.fontSize = size + 'px';
  while (size > 28 && el.scrollWidth > el.parentElement.clientWidth) el.style.fontSize = --size + 'px';
}
document.fonts.ready.then(fit);
addEventListener('resize', fit);

// ---- below the fold ----
const bio = album.artists_wikipedia?.[album.artists[0]?.name]?.biography || album.artists[0]?.biography || '';
$('story').textContent = bio.split(/(?<=\.)\s/).slice(0, 4).join(' ');
const bySide = {};
for (const t of album.tracklist || []) (bySide[(t.position || '?').replace(/\d+$/, '') || '·'] ||= []).push(t);
const secs = (album.tracklist || []).reduce((n, t) => { const [m, s] = (t.duration || '0:0').split(':').map(Number); return n + (m * 60 + (s || 0)); }, 0);
$('tl-meta').textContent = `${album.tracklist.length} tracks · ${Math.floor(secs / 60)}m ${secs % 60}s`;
$('sides').innerHTML = Object.entries(bySide).map(([side, tracks]) => `
  <div class="side"><h3 class="t-wide"><span class="side-dot"></span>Side ${side}</h3>
  <ol>${tracks.map((t) => `<li><span class="pos">${t.position}</span><span>${t.title}</span><span class="dur">${t.duration || ''}</span></li>`).join('')}</ol></div>`).join('');

// ---- mock controls ----
const pick = (s) => `<a href="${link('album', s)}" class="${s === slug ? 'on' : ''}">${s.replace(/-\d+$/, '').replace(/-/g, ' ')}</a>`;
const link = (k, v) => { const p = new URLSearchParams(location.search); p.set(k, v); return '?' + p; };
$('ctl').innerHTML = `
  <b>Room</b>${Object.entries(rooms).map(([id, r]) => `<a href="${link('room', id)}" class="${id === roomId ? 'on' : ''}">${r.label}</a>`).join('')}
  <b>Record</b>${ALBUMS.map(pick).join('')}
  <b>Patterned</b>${PATTERNED.map(pick).join('')}`;
