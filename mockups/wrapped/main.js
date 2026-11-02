import { $, bus, loadYear, state } from './core.js';

const ALL = ['cover', 'record', 'skyline', 'clock', 'weight', 'vinyl', 'artists', 'genres', 'decades', 'credits', 'connections', 'finale'];
// ?only=clock,vinyl renders just those chapters (handy for checking one at a time).
const only = new URLSearchParams(location.search).get('only')?.split(',');
const IDS = only ? ALL.filter(id => only.includes(id)) : ALL;
for (const id of ALL) if (!IDS.includes(id)) document.getElementById(id).remove();
const YEARS = Array.from({ length: 12 }, (_, i) => 2015 + i);

// A chapter that fails to load or render is logged and skipped, so the rest still work.
const chapters = (await Promise.all(IDS.map(id =>
  import(`./chapters/${id}.js`).then(m => m.default).catch(e => { console.warn(`chapter ${id}:`, e.message); return null; }),
))).filter(Boolean);

for (const c of chapters) {
  const el = document.getElementById(c.id);
  try { c.init?.(el); } catch (e) { console.error(c.id, e); }
}

bus.addEventListener('year', e => {
  $('#years').innerHTML = YEARS.map(y => `<button class="pill sm" aria-pressed="${y === state.year}" data-y="${y}">${y}</button>`).join('');
  history.replaceState(null, '', `?year=${state.year}${only ? `&only=${only}` : ''}${location.hash}`);
  document.title = `${state.year} Wrapped — mockup`;
  for (const c of chapters) {
    try { c.render?.(e.detail); } catch (err) { console.error(c.id, err); }
  }
});
$('#years').addEventListener('click', e => { const y = e.target.dataset.y; if (y) loadYear(+y); });

loadYear(+(new URLSearchParams(location.search).get('year')) || 2024);
