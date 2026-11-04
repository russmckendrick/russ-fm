import { useEffect, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StatsData } from '@/types/stats';
import { statsView, type StatsChapter, type StatsChapterFactory } from './kit';
import growth from './chapters/growth';
import reach from './chapters/reach';
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
  ['reach', reach],
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
 * chapter builds its own DOM in an empty section; this mounts them, hands them the
 * data and tears them down on the way out.
 */
export default function StatsStory({ data }: { data: StatsData }) {
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const view = statsView(data);
    const sections = root.current!.querySelectorAll<HTMLElement>('section');
    const chapters: StatsChapter[] = CHAPTERS.flatMap(([id, make], i) => {
      try {
        const c = make(sections[i]);
        c.render(view);
        return [c];
      } catch (err) {
        console.error(`Stats chapter ${id}:`, err);
        return [];
      }
    });
    return () => chapters.forEach(c => c.dispose());
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
      {CHAPTERS.map(([id]) => <section key={id} id={id} className="chapter" />)}
    </div>
  );
}
