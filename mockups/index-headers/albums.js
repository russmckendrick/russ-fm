// Albums index header: the newest records standing on a record-shop ledge.
import { $, placeRoom, flood, year, n } from './room.js';

const [all, colours, slots] = await Promise.all([
  fetch('/collection.json').then((r) => r.json()),
  fetch('/album-colors.json').then((r) => r.json()),
  fetch('assets/slots.json').then((r) => r.json()),
]);
const meta = slots.albums;
const records = all.filter((r) => r.boxset == null).sort((a, b) => b.date_added.localeCompare(a.date_added));
flood(colours[records[0].uri_release] || { flood: '#a8453f', ink: '#fbf7ef' });

const sleeves = records.slice(0, meta.slots.length).map((r) => {
  const a = document.createElement('a');
  a.className = 'slot sleeve';
  a.href = r.uri_release;
  a.title = `${r.release_name} — ${r.release_artist}`;
  a.innerHTML = `<img src="${r.images_uri_release['hi-res']}" alt="">`;
  return a;
});
$('room').prepend(...sleeves);
$('roomImg').src = 'assets/albums.webp';
$('shade').src = 'assets/albums-shade.webp';
$('tint').style.background = 'var(--flood)';
placeRoom(meta, sleeves);

const thisYear = String(new Date().getFullYear());
$('count').textContent = n(records.length);
$('meta').innerHTML = [
  ['Vinyl', n(records.filter((r) => r.format_primary === 'Vinyl').length)],
  ['Box sets', n(all.filter((r) => r.formats?.includes('Box Set') && r.boxset == null).length)],
  [`Added in ${thisYear}`, n(records.filter((r) => r.date_added.startsWith(thisYear)).length)],
  ['Latest', records[0].release_name],
].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

$('grid').innerHTML = records.slice(meta.slots.length, meta.slots.length + 18)
  .map((r) => `<div><img src="${r.images_uri_release.medium}" alt="" loading="lazy"><p>${r.release_name}</p><small>${r.release_artist} · ${year(r)}</small></div>`).join('');
