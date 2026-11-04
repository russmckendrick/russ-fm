// Artists index header: a fly-posting wall, one poster per artist (most collected,
// or ?pick=latest for the newest arrivals), printed like the artist page's poster.
import { $, placeRoom, flood, n } from './room.js';

const q = new URLSearchParams(location.search);
const pick = q.get('pick') === 'latest' ? 'latest' : 'most';
const [all, colours, slots] = await Promise.all([
  fetch('/collection.json').then((r) => r.json()),
  fetch('/album-colors.json').then((r) => r.json()),
  fetch('assets/slots.json').then((r) => r.json()),
]);
const meta = slots.artists;
const records = all.filter((r) => r.boxset == null).sort((a, b) => b.date_added.localeCompare(a.date_added));

// One entry per artist: their records (newest first) and when they arrived.
const by = new Map();
for (const r of records) for (const a of r.artists) {
  if (a.name === 'Various') continue;
  const e = by.get(a.uri_artist) ?? { name: a.name, uri: a.uri_artist, slug: a.uri_artist.split('/')[2], records: [], first: r.date_added };
  e.records.push(r);
  e.first = r.date_added < e.first ? r.date_added : e.first;
  by.set(a.uri_artist, e);
}
const artists = [...by.values()];
const ranked = pick === 'latest'
  ? [...artists].sort((a, b) => b.first.localeCompare(a.first))
  : [...artists].sort((a, b) => b.records.length - a.records.length);
const top = ranked.slice(0, meta.slots.length);
flood(colours[top[0].records[0].uri_release] || { flood: '#b26440', ink: '#0e0d0c' });

// Photo: the chosen fanart, else their own photo; aimed at the faces (as PosterWall).
const infos = await Promise.all(top.map((a) => fetch(`/artist/${a.slug}/${a.slug}-image.json`).then((r) => r.json()).catch(() => null)));
const posters = top.map((a, i) => {
  const info = infos[i], fan = info?.fanart;
  const photo = fan ? `/artist/${a.slug}/${fan.file}` : a.records[0].artists.find((x) => x.uri_artist === a.uri)?.images_uri_artist?.['hi-res'] ?? `/artist/${a.slug}/${a.slug}-hi-res.jpg`;
  const faces = (fan ? fan.faces : info?.faces) || [];
  const focus = faces.length
    ? [0, 1].map((k) => ((Math.min(...faces.map((f) => f[k])) + Math.max(...faces.map((f) => f[k] + f[k + 2]))) / 2) * 100)
    : [50, 30];
  const pal = colours[a.records[0].uri_release] || { flood: '#b26440' };
  const el = document.createElement('a');
  el.className = 'slot poster';
  el.href = a.uri;
  el.title = `${a.name} — ${a.records.length} records`;
  el.style.setProperty('--flood', pal.flood);
  el.innerHTML = `
    <div class="poster-photo"><img src="${photo}" alt="" style="object-position:${focus[0]}% ${focus[1]}%"></div>
    <div class="poster-foot"><span class="poster-name">${a.name}</span></div>
    <div class="poster-wear"></div>`;
  return el;
});
$('room').prepend(...posters);
$('roomImg').src = 'assets/artists.webp';
$('shade').src = 'assets/artists-shade.webp';
$('tint').style.background = 'var(--flood)';

// Names fit the poster's width over at most two lines.
placeRoom(meta, posters, () => posters.forEach((p) => {
  const name = p.querySelector('.poster-name'), u = parseFloat(p.style.getPropertyValue('--u'));
  let size = Math.round(u * 22);
  name.style.fontSize = size + 'px';
  while (size > 8 && (name.scrollWidth > name.clientWidth || name.offsetHeight > size * 0.82 * 2 + 1)) name.style.fontSize = --size + 'px';
}));

const most = [...artists].sort((a, b) => b.records.length - a.records.length)[0];
const thisYear = String(new Date().getFullYear());
$('count').textContent = n(artists.length);
$('meta').innerHTML = [
  ['Records', n(records.length)],
  ['Most collected', `${most.name}, ${most.records.length}`],
  [`New in ${thisYear}`, n(artists.filter((a) => a.first.startsWith(thisYear)).length)],
].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

$('grid').innerHTML = [...artists].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 18)
  .map((a) => `<div><img src="${a.records[0].artists.find((x) => x.uri_artist === a.uri)?.images_uri_artist?.medium ?? ''}" alt="" loading="lazy"><p>${a.name}</p><small>${a.records.length} record${a.records.length === 1 ? '' : 's'}</small></div>`).join('');

const link = (v) => { const p = new URLSearchParams(location.search); p.set('pick', v); return '?' + p; };
$('ctl').innerHTML = [['most', 'Most collected'], ['latest', 'Newest arrivals']].map(([v, t]) => `<a href="${link(v)}" class="${v === pick ? 'on' : ''}">${t}</a>`).join('');
