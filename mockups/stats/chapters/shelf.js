import { head, sleeve } from '../../wrapped/core.js';

// The two lists kept from today's page: the newest records, and the least-heard ones on Last.fm.
let el;

export default {
  id: 'shelf',
  init(e) { el = e; },
  render(data) {
    const latest = data.releases.slice(-12).reverse();
    const gems = data.releases.filter(r => r.lis > 0 && r.lis < 5000).sort((a, b) => a.lis - b.lis).slice(0, 12);
    el.innerHTML = `<div class="wrap">
      ${head('07', 'Still on the shelf', 'Latest additions')}
      <div class="sh-row">${latest.map(r => sleeve(r)).join('')}</div>
      <h3 class="display sh-h">Hidden gems</h3>
      <p class="lede">Records with fewer than 5,000 listeners on Last.fm, the quietest first.</p>
      <div class="sh-row">${gems.map(r => sleeve(r)).join('')}</div>
    </div>`;
  },
};
