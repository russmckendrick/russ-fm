import { useEffect, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StatsData } from '@/types/stats';
import { statsView, type StatsChapter, type StatsChapterFactory } from './kit';
import growth from './chapters/growth';
import origins from './chapters/origins';
import artists from './chapters/artists';
import pile from './chapters/pile';
import specs from './chapters/specs';
import timemachine from './chapters/timemachine';
import longhaul from './chapters/longhaul';
import decades from './chapters/decades';
import credits from './chapters/credits';
import sleeves from './chapters/sleeves';
import owners from './chapters/owners';
import '../wrapped/story/story.css';
import '../wrapped/story/chapters/credits.css';
import './stats.css';

const CHAPTERS: Array<[id: string, make: StatsChapterFactory]> = [
  ['growth', growth],
  ['origins', origins],
  ['artists', artists],
  ['pile', pile],
  ['specs', specs],
  ['timemachine', timemachine],
  ['longhaul', longhaul],
  ['decades', decades],
  ['credits', credits],
  ['sleeves', sleeves],
  ['owners', owners],
];

/**
 * The /stats chapters, drawn from public/stats/stats.json. Like WrappedStory, each
 * chapter builds its own DOM in an empty section; this hands them the data and tears them
 * down on the way out. A chapter is only built once its section comes within a couple of
 * screens of the viewport, one chapter per task, so landing on the page builds the first one
 * or two and the rest follow as you scroll, never all twelve in one long block.
 */
export default function StatsStory({ data }: { data: StatsData }) {
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const view = statsView(data);
    const sections = [...root.current!.querySelectorAll<HTMLElement>(':scope > section')];
    const built: StatsChapter[] = [];
    const queue: number[] = [];
    let timer = 0;
    const build = (i: number) => {
      const [id, make] = CHAPTERS[i];
      try {
        const c = make(sections[i]);
        c.render(view);
        built.push(c);
      } catch (err) {
        console.error(`Stats chapter ${id}:`, err);
      }
      sections[i].classList.remove('pending');
    };
    // One chapter per task, in page order, so the browser can paint and scroll in between.
    const pump = () => {
      timer = 0;
      const i = queue.shift();
      if (i === undefined) return;
      build(i);
      if (queue.length) timer = window.setTimeout(pump, 0);
    };
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        queue.push(sections.indexOf(e.target as HTMLElement));
      }
      queue.sort((a, b) => a - b);
      if (queue.length && !timer) timer = window.setTimeout(pump, 0);
    }, { rootMargin: '150% 0px' });
    sections.forEach(s => io.observe(s));
    return () => {
      io.disconnect();
      clearTimeout(timer);
      built.forEach(c => c.dispose());
    };
  }, [data]);

  // The chapters write plain links; route the site's own through the router.
  const onClick = (e: MouseEvent) => {
    const href = (e.target as Element).closest('a')?.getAttribute('href');
    if (!href?.startsWith('/') || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };

  return (
    <div ref={root} className="ws stats-story" onClick={onClick}>
      {CHAPTERS.map(([id]) => <section key={id} id={id} className="chapter pending" />)}
    </div>
  );
}
