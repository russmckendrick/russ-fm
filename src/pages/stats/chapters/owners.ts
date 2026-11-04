// 12 · Who owns it: the ℗ line Apple Music gives each record, filed under the major that
// owns the label named (or independent), drawn as one square per record.
import { countUp, esc, head, onVisible, plural } from '../../wrapped/story/core';
import { n, strip, type StatsChapter, type StatsView } from '../kit';

const COLOUR: Record<string, string> = {
  Independent: '#e9a23b', Universal: '#3c7bd8', Sony: '#c8553d', Warner: '#5aa469', BMG: '#b05fc4', Concord: '#2fb5b0',
};

export default function owners(el: HTMLElement): StatsChapter {
  let io: IntersectionObserver | null = null;

  function render(v: StatsView) {
    io?.disconnect();
    const { known, groups } = v.owners;
    if (!known || !groups.length) { el.innerHTML = ''; return; }
    const indie = groups.find(g => g.name === 'Independent')?.n ?? 0;
    const majors = groups.filter(g => g.name !== 'Independent');
    const pct = (c: number) => Math.round((c / known) * 100);

    el.innerHTML = `<div class="wrap">
      ${head('12', 'Who owns it', 'Majors and independents', `Who holds the recordings, from the ℗ line on ${plural(known, 'record')}. Labels are filed under the major that owns them, as the line names it; one square is one record.`)}
      <div class="stats st-stats">
        <div class="stat"><b><span data-n="${pct(indie)}">0</span>%</b><span>independent: ${n(indie)} records owned outside the majors</span></div>
        ${majors[0] ? `<div class="stat"><b><span data-n="${pct(majors[0].n)}">0</span>%</b><span>${esc(majors[0].name)}, the biggest of the majors</span></div>` : ''}
        <div class="stat"><b data-n="${v.totals.records - known}">0</b><span>records with no ℗ line to read</span></div>
      </div>
      <div class="ow-waffle" role="img" aria-label="${groups.map(g => `${g.name} ${g.n}`).join(', ')}">${groups.map(g => `<i style="--c:${COLOUR[g.name] ?? '#8b8f94'}" data-g="${esc(g.name)}"></i>`.repeat(g.n)).join('')}</div>
      <div class="ow-groups">${groups.map(g => `
        <div class="ow-group" data-g="${esc(g.name)}" style="--c:${COLOUR[g.name] ?? '#8b8f94'}">
          <div class="cr-line"><b><i></i>${esc(g.name)}</b><span>${n(g.n)} <small>${pct(g.n)}%</small></span></div>
          ${strip(v, g.s.slice(0, 8))}
        </div>`).join('')}
      </div>
    </div>`;

    // Hovering a group lights its squares.
    const waffle = el.querySelector<HTMLElement>('.ow-waffle')!;
    const squares = [...waffle.children] as HTMLElement[];
    el.querySelectorAll<HTMLElement>('.ow-group').forEach(g => {
      g.addEventListener('pointerenter', () => { waffle.classList.add('focus'); squares.forEach(i => i.classList.toggle('lit', i.dataset.g === g.dataset.g)); });
      g.addEventListener('pointerleave', () => waffle.classList.remove('focus'));
    });
    io = onVisible(waffle, () => {
      waffle.classList.add('in');
      el.querySelectorAll<HTMLElement>('[data-n]').forEach(b => countUp(b, +b.dataset.n!));
    }, { threshold: 0.15 });
  }

  return { render, dispose: () => io?.disconnect() };
}
