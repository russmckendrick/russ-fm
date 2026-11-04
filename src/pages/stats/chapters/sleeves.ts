// 11 · Who made the sleeves: the designers and photographers credited across the collection,
// each with a wall of the covers they made.
import { esc, head, onVisible, plural } from '../../wrapped/story/core';
import type { StatsRanked } from '@/types/stats';
import { strip, type StatsChapter, type StatsView } from '../kit';

export default function sleeves(el: HTMLElement): StatsChapter {
  let io: IntersectionObserver | null = null;

  function render(v: StatsView) {
    io?.disconnect();
    const { design, photo } = v.sleeves;
    if (!design.length && !photo.length) { el.innerHTML = ''; return; }
    const person = (r: StatsRanked, i: number) => `
      <div class="sl-person" style="--i:${i}">
        <div class="sl-name"><b>${esc(r.name)}</b><span>${plural(r.n, 'sleeve')}</span></div>
        ${strip(v, r.s.slice(0, 10), 'sl-wall')}
      </div>`;
    const lead = design[0], snapper = photo[0];

    el.innerHTML = `<div class="wrap">
      ${head('11', 'Cover stars', 'Who made the sleeves', [
        lead && `${esc(lead.name)} designed ${plural(lead.n, 'sleeve')} here`,
        snapper && `${esc(snapper.name)} took the photographs on ${snapper.n}`,
      ].filter(Boolean).join('; ') + '. The designers and photographers on the sleeve credits.')}
      <div class="sl-cols">
        ${design.length ? `<div><p class="label cr-title">Design and artwork</p>${design.slice(0, 6).map(person).join('')}</div>` : ''}
        ${photo.length ? `<div><p class="label cr-title">Photography</p>${photo.slice(0, 6).map(person).join('')}</div>` : ''}
      </div>
    </div>`;
    const box = el.querySelector('.sl-cols')!;
    io = onVisible(box, () => box.classList.add('in'), { threshold: 0.1 });
  }

  return { render, dispose: () => io?.disconnect() };
}
