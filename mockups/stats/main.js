// /stats mockup: the record-room hero, then the Wrapped chapters run over every year.
import { bus, loadYear } from '../wrapped/core.js';
import { $, placeRoom, flood, n } from '../index-headers/room.js';
import credits from '../wrapped/chapters/credits.js';
import growth from './chapters/growth.js';
import origins from './chapters/origins.js';
import pile from './chapters/pile.js';
import longhaul from './chapters/longhaul.js';
import decades from './chapters/decades.js';
import shelf from './chapters/shelf.js';

const slots = (await (await fetch('assets/slots.json')).json()).stats;

// The Wrapped chapters, renumbered and reworded for all time.
const relabel = (c, num, lede) => ({
  ...c,
  render(data) {
    c.render(data);
    const el = document.getElementById(c.id);
    el.querySelector('.track .num').textContent = num;
    if (lede) el.querySelector('.lede').innerHTML = lede(el.querySelector('.lede').innerHTML);
  },
});
const chapters = [
  growth,
  origins,
  pile,
  longhaul,
  decades,
  relabel(credits, '06', s => s.replace('behind the year', 'behind the collection')),
  shelf,
];
for (const c of chapters) c.init?.(document.getElementById(c.id));

bus.addEventListener('year', e => {
  const data = e.detail;
  hero(data);
  for (const c of chapters) {
    try { c.render(data); } catch (err) { console.error(c.id, err); }
  }
});
loadYear('all');

function hero(data) {
  const latest = data.releases.at(-1);
  flood(latest.c?.flood ? latest.c : { flood: '#a8453f', ink: '#fbf7ef' });

  // Each cube holds the record that holds the record; the tag below it is the collection's total.
  const els = data.holders.map((h, i) => {
    const a = document.createElement('a');
    a.className = 'slot holder';
    a.href = `/album/${h.r.s}/`;
    a.title = `${h.r.t} — ${h.r.by}`;
    a.style.setProperty('--tilt', `${[-2.2, 1.4, -0.8, 2, -1.6, 1][i]}deg`);
    a.innerHTML = `<img src="${h.r.img.replace('-medium.', '-hi-res.')}" alt="">
      <span class="tag"><b>${h.stat}</b><small>${h.label}</small><em>${h.r.what}<br>${h.r.t}</em></span>`;
    return a;
  });
  document.querySelectorAll('.slot.holder').forEach(s => s.remove());
  $('room').prepend(...els);
  $('roomImg').src = 'assets/stats.webp';
  $('shade').src = 'assets/stats-shade.webp';
  $('tint').style.background = 'var(--flood)';
  placeRoom(slots, els);

  const t = data.totals;
  const busiest = Object.entries(data.perYear).reduce((a, b) => (b[1] > a[1] ? b : a));
  const since = new Date(`${t.since}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  $('count').textContent = n(t.records);
  $('meta').innerHTML = [
    ['Since', since],
    ['Artists', n(t.artists)],
    ['Played end to end', `${Math.round(t.hours / 24)} days`],
    ['Busiest year', `${busiest[0]} · ${busiest[1]}`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}
