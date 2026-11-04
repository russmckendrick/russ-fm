// Artist poster mockup: the artist hero as a worn fly-poster on a wall, after the
// album's listening room. The wall is picked like the release rooms: by /tv room
// (tvRoomFor), here the artist's most common room across their records.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TV_ROOMS, tvRoomFor } from '/src/lib/tv.ts';
import { serviceIconFor } from '/src/components/player/service-icon.tsx';

const q = new URLSearchParams(location.search);
const ARTISTS = ['radiohead', 'massive-attack', 'pj-harvey', 'fleetwood-mac', 'the-cure', 'alice-in-chains', 'counting-crows', 'pulp', 'the-national', 'zz-top'];
const slug = q.get('artist') || ARTISTS[0];
const $ = (id) => document.getElementById(id);

const [artist, info, collection, colours, walls] = await Promise.all([
  fetch(`/artist/${slug}/${slug}.json`).then((r) => r.json()),
  fetch(`/artist/${slug}/${slug}-image.json`).then((r) => r.json()).catch(() => null),
  fetch('/collection.json').then((r) => r.json()),
  fetch('/album-colors.json').then((r) => r.json()),
  fetch('assets/walls/walls.json').then((r) => r.json()),
]);
const records = collection
  .filter((a) => a.artists.some((x) => x.uri_artist === `/artist/${slug}/`))
  .sort((a, b) => b.date_added.localeCompare(a.date_added));

// The wall: the room most of their records play in (ties go to the newest record's).
const counts = new Map();
for (const r of records) {
  const id = tvRoomFor(r.genre_names ?? [], r.styles ?? []);
  counts.set(id, (counts.get(id) ?? 0) + 1);
}
const picked = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'shelves';
const roomId = walls[q.get('room')] ? q.get('room') : walls[picked] ? picked : Object.keys(walls)[0];
const wall = walls[roomId];

// Palette: the newest record's flood, as the page flood does today.
const pal = colours[records[0]?.uri_release] || { flood: '#b26440', ink: '#0e0d0c', ground: '#1c1916' };
const root = document.documentElement.style;
root.setProperty('--flood', pal.flood);
root.setProperty('--ink', pal.ink);
root.setProperty('--ground', pal.ground || '#1c1916');

// The photo: the chosen fanart, else their own photo; aimed at the faces.
const fan = info?.fanart;
const photo = fan ? `/artist/${slug}/${fan.file}` : `/artist/${slug}/${slug}-hi-res.jpg`;
const faces = (fan ? fan.faces : info?.faces) || [];
const focus = faces.length
  ? [0, 1].map((k) => {
      const lo = Math.min(...faces.map((f) => f[k])), hi = Math.max(...faces.map((f) => f[k] + f[k + 2]));
      return ((lo + hi) / 2) * 100;
    })
  : [50, 30];

// ---- the poster: overprinted name and the newest sleeves; the name is the page's h1 ----
const unique = records.filter((r, i, a) => a.findIndex((x) => x.release_name.toLowerCase() === r.release_name.toLowerCase()) === i);
$('poster').innerHTML = `
  <div class="poster-photo"><img src="${photo}" alt="" style="object-position:${focus[0]}% ${focus[1]}%"></div>
  <div class="poster-foot">
    <h1 class="poster-name" id="posterName">${artist.name}</h1>
    <div class="poster-sleeves">${unique.slice(0, 4).map((r) => `<img src="${r.images_uri_release.medium}" alt="" title="${r.release_name}">`).join('')}</div>
  </div>
  <div class="poster-wear"></div>`;

const roomEl = $('room');
$('roomImg').src = `assets/walls/${roomId}.webp`;
$('shade').style.backgroundImage = `url(assets/walls/${roomId}-shade.webp)`;
$('tint').style.background = pal.flood;

// Cover the box with the wall, the poster centred a little above the middle.
function layout() {
  const w = roomEl.clientWidth, fullH = roomEl.clientHeight, inset = 72;
  const zoom = Number(q.get('zoom') || 1.06);
  const width = Math.max(w, fullH * wall.aspect) * zoom;
  const height = width / wall.aspect;
  const [px, py, pw, ph] = wall.poster;
  const left = Math.min(0, Math.max(w - width, w / 2 - (px + pw / 2) * width));
  const top = Math.min(0, Math.max(fullH - height, inset + (fullH - inset) * 0.47 - (py + ph / 2) * height));
  const at = (x, y, bw, bh, bleed = 0) => `left:${left + x * width - bleed}px;top:${top + y * height - bleed}px;width:${bw * width + 2 * bleed}px;height:${bh * height + 2 * bleed}px`;
  for (const id of ['roomImg', 'tint']) Object.assign($(id).style, box(at(0, 0, 1, 1)));
  Object.assign($('shade').style, box(at(px, py, pw, ph)));
  Object.assign($('poster').style, box(at(px, py, pw, ph, 3)));
  $('poster').style.setProperty('--u', `${(pw * width + 6) / 100}px`);
  fitTo($('posterName'), ((pw * width) / 100) * 16);
}
const box = (css) => Object.fromEntries(css.split(';').map((d) => d.split(':')));
new ResizeObserver(layout).observe(roomEl);
document.fonts.ready.then(layout);

// One-line fit, like FitTitle.
function fitTo(el, max) {
  let size = Math.round(max);
  el.style.fontSize = size + 'px';
  while (size > 8 && el.scrollWidth > el.clientWidth) el.style.fontSize = --size + 'px';
}

// ---- band: metadata and links only (the poster carries the name) ----
const years = records.map((r) => r.year_original || Number(r.date_release_year?.slice(0, 4))).filter(Boolean);
const genres = [...new Set(records.flatMap((r) => r.genre_names))].slice(0, 4);
$('meta').innerHTML = [
  artist.country && ['From', artist.country],
  artist.formed_date && ['Formed', String(artist.formed_date).slice(0, 4)],
  ['Records', records.length],
  years.length && ['Releases', `${Math.min(...years)}–${Math.max(...years)}`],
  genres.length && ['Genres', genres.join(', ')],
].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
// Brand icons, as the album band: serviceIconFor, round buttons, no letters.
const icon = (url) => renderToStaticMarkup(createElement(serviceIconFor(url), { 'aria-hidden': true }));
$('extras').innerHTML = [['Spotify', artist.spotify_url], ['Apple Music', artist.apple_music_url], ['Last.fm', artist.lastfm_url], ['Discogs', artist.discogs_url], ['Wikipedia', artist.wikipedia_url]]
  .filter(([, u]) => u && serviceIconFor(u))
  .map(([t, u]) => `<a class="icon-btn" href="${u}" target="_blank" rel="noopener noreferrer" aria-label="${t}" title="${t}">${icon(u)}</a>`).join('');

// ---- below ----
$('story').textContent = (artist.biography || '').split(/(?<=\.)\s/).slice(0, 4).join(' ');
$('records').innerHTML = records.map((r) => `<div><img src="${r.images_uri_release.medium}" alt="" loading="lazy"><p>${r.release_name}</p><small>${r.year_original || ''}</small></div>`).join('');

// ---- mock controls ----
const link = (k, v) => { const p = new URLSearchParams(location.search); p.set(k, v); return '?' + p; };
$('ctl').innerHTML = `
  <b>Wall</b>${TV_ROOMS.filter((r) => walls[r.id]).map((r) => `<a href="${link('room', r.id)}" class="${r.id === roomId ? 'on' : ''}" title="${r.id}">${r.name}${r.id === picked ? ' ★' : ''}</a>`).join('')}
  <b>Artist</b>${ARTISTS.map((s) => `<a href="${link('artist', s)}" class="${s === slug ? 'on' : ''}">${s.replace(/-/g, ' ')}</a>`).join('')}`;
