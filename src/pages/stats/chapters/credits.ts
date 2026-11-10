// 09 · Behind the glass: the people on the credits across every record (songwriters by songs
// written, then producers, engineers and mixers, mastering, lacquer cutting) and the labels.
// Drawn with Wrapped's credits boards (credits.css).
import { esc, head, onVisible, plural } from '../../wrapped/story/core';
import type { StatsRanked } from '@/types/stats';
import { fallback, strip, type StatsChapter, type StatsView } from '../kit';

const BOARDS: Array<[key: keyof StatsView['boards'], title: string, verb: string]> = [
  ['written', 'Songwriters', 'wrote songs on'],
  ['produced', 'Produced by', 'produced'],
  ['engineered', 'Recorded and mixed by', 'recorded or mixed'],
  ['mastered', 'Mastered by', 'mastered'],
  ['cut', 'Lacquer cut by', 'cut'],
  ['labels', 'Labels', 'released'],
];

export default function credits(el: HTMLElement): StatsChapter {
  let ios: IntersectionObserver[] = [];

  function render(v: StatsView) {
    ios.forEach(io => io.disconnect());
    const boards = BOARDS.map(([k, title, verb]) => ({ title, verb, rows: v.boards[k] })).filter(b => b.rows.length);
    if (!boards.length) { el.innerHTML = ''; return; }
    const writer = v.boards.written[0], ludwig = v.boards.mastered[0], label = v.boards.labels[0];
    const colour = (r: StatsRanked) => r.s.map(s => v.bySlug.get(s)?.f).find(Boolean) ?? fallback;
    const lede = [
      writer && `${esc(writer.name)} wrote ${plural(writer.songs ?? 0, 'song')} on these shelves.`,
      ludwig && `${esc(ludwig.name)} mastered ${plural(ludwig.n, 'record')}.`,
      label && `${esc(label.name)} put out the most, ${label.n}.`,
      'The people and labels behind the collection, read from every sleeve credit.',
    ].filter(Boolean).join(' ');

    el.innerHTML = `<div class="wrap">
      ${head('09', 'Behind the glass', 'Behind the glass', lede)}
      <div class="cr-boards">${boards.map(b => {
        const max = b.rows[0].songs ?? b.rows[0].n;
        return `<div class="cr-board"><p class="label cr-title">${b.title}</p>
          ${b.rows.slice(0, 6).map((r, i) => {
            const count = r.songs ?? r.n;
            return `<div class="cr-row" style="--i:${i};--w:${count / max};--c:${colour(r)}">
              <div class="cr-line"><b>${esc(r.name)}</b><span>${r.songs != null ? `${r.songs}<small> songs</small>` : r.n}</span></div>
              <div class="cr-bar"><i></i></div>
              <div title="${esc(r.name)} ${b.verb} ${plural(r.n, 'record')}">${strip(v, r.s)}</div>
            </div>`;
          }).join('')}</div>`;
      }).join('')}
      </div>
    </div>`;
    const box = el.querySelector('.cr-boards')!;
    ios = [onVisible(box, () => box.classList.add('in'), { threshold: 0.1 })];
  }

  return { render, dispose: () => ios.forEach(io => io.disconnect()) };
}
