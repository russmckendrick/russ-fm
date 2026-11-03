// B5 · Behind the glass: who cut, mastered and produced the year's records, the labels, and the editions as ring meters.
import { $, esc, head, onVisible, plural, type Chapter, type Release, type Story } from '../core';

const EDITIONS = ['Limited Edition', 'Reissue', 'Remastered', 'Record Store Day', 'Deluxe Edition', 'Numbered', '45 RPM', 'Compilation', 'Special Edition', 'Repress'];

type Board = [title: string, key: string, rows: Array<[string, Release[]]>, verb: string];

// Name -> records, most first. Credits come as arrays, labels as a single value.
function tally(recs: Release[], get: (r: Release) => string[] | string | null) {
  const m = new Map<string, Release[]>();
  for (const r of recs) for (const n of ([] as string[]).concat(get(r) || [])) {
    if (!n || /^various/i.test(n)) continue;
    if (m.has(n)) m.get(n)!.push(r);
    else m.set(n, [r]);
  }
  return [...m].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
}
// Discogs disambiguates duplicate names with " (2)"; readers don't need that.
const clean = (n: string) => n.replace(/\s\(\d+\)$/, '');

export default function credits(el: HTMLElement): Chapter {
  let stops: Array<() => void> = [];
  const cleanup = () => { stops.forEach(f => f()); stops = []; };

  function render(story: Story) {
    cleanup();
    const recs = story.releases;
    const boards = ([
      ['Lacquer cut by', 'cut', tally(recs, r => r.cut), 'cut'],
      ['Mastered by', 'mas', tally(recs, r => r.mas), 'mastered'],
      ['Produced by', 'prod', tally(recs, r => r.prod.filter(p => !r.a.some(a => story.artistBySlug.get(a)?.name === p))), 'produced'],
      ['Labels', 'lab', tally(recs, r => r.lab), 'released'],
    ] as Board[]).filter(b => b[2].length);
    const cutter = boards.find(b => b[1] === 'cut')?.[2][0];
    const label = boards.find(b => b[1] === 'lab')?.[2][0];
    const lede = [
      cutter && `${esc(clean(cutter[0]))} cut ${cutter[1].length === 1 ? 'one' : cutter[1].length} of them.`,
      label && `${esc(clean(label[0]))} put out the most, ${plural(label[1].length, 'record')}.`,
      'The people and labels behind the year, read from the sleeve credits.',
    ].filter(Boolean).join(' ');

    const eds = EDITIONS.map(name => ({ name, recs: recs.filter(r => r.ed.includes(name)) })).filter(e => e.recs.length)
      .sort((a, b) => b.recs.length - a.recs.length);
    const R = 52, C = 2 * Math.PI * R;
    const used = new Set<string>();

    el.innerHTML = `
      <div class="wrap">
        ${head('B5', 'Behind the glass', 'Behind the glass', lede)}
        <div class="cr-boards">${boards.map(([title, , rows, verb]) => {
          const max = rows[0][1].length;
          return `
          <div class="cr-board">
            <p class="label cr-title">${title}</p>
            ${rows.map(([name, list], i) => `
              <div class="cr-row" style="--i:${i};--w:${list.length / max};--c:${list.find(r => r.c.flood)?.c.flood || '#e9a23b'}">
                <div class="cr-line"><b>${esc(clean(name))}</b><span>${list.length}</span></div>
                <div class="cr-bar"><i></i></div>
                <div class="cr-strip" title="${esc(clean(name))} ${verb} ${plural(list.length, 'record')}">
                  ${list.slice(0, 14).map(r => `<a href="/album/${r.s}/"><img src="${r.img}" alt="${esc(r.t)}" loading="lazy"></a>`).join('')}
                </div>
              </div>`).join('')}
          </div>`;
        }).join('')}
        </div>

        <p class="label cr-ed-k">Pressings and editions</p>
        <div class="cr-eds">${eds.map((e, i) => {
          const pct = e.recs.length / recs.length;
          // A different sleeve in each ring, where the edition has one to spare.
          const r = e.recs.find(x => x.c.flood && !used.has(x.s)) || e.recs[0];
          used.add(r.s);
          return `
          <div class="cr-ed" style="--i:${i};--c:${r.c.flood || '#e9a23b'}">
            <div class="cr-ring">
              <svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="${R}"/><circle class="fg" cx="60" cy="60" r="${R}"
                stroke-dasharray="${C}" style="--off:${C * (1 - pct)};--full:${C}"/></svg>
              <img src="${r.img}" alt="" loading="lazy">
              <b>${Math.round(pct * 100)}<small>%</small></b>
            </div>
            <span class="cr-ed-name">${esc(e.name)}</span>
            <span class="cr-ed-n">${e.recs.length} of ${recs.length}</span>
          </div>`;
        }).join('')}
        </div>
      </div>`;

    for (const sel of ['.cr-boards', '.cr-eds']) {
      const box = $(sel, el);
      const io = onVisible(box, () => box.classList.add('in'), { threshold: 0.12 });
      stops.push(() => io.disconnect());
    }
  }

  return { render, dispose: cleanup };
}
