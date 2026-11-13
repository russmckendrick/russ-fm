import { useEffect, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WrappedData } from '@/types/wrapped';
import { buildStory, bus, type Chapter, type ChapterFactory } from './core';
import './story.css';

/** The chapters in page order; each is chapters/<id>.ts with its own <id>.css. */
const IDS = ['cover', 'record', 'skyline', 'weight', 'vinyl', 'artists', 'genres', 'decades', 'credits', 'connections', 'finale'];
const FACTORIES = import.meta.glob<ChapterFactory>('./chapters/*.ts', { eager: true, import: 'default' });
import.meta.glob('./chapters/*.css', { eager: true });

/**
 * `/wrapped/:year` as a scroll of chapters drawn from the year's `story` block.
 * The chapters build their own DOM (canvas, SVG, animation loops) inside the
 * empty sections rendered here; this component mounts them once, hands them each
 * year's data and tears them down on the way out.
 */
export default function WrappedStory({ data }: { data: WrappedData }) {
  const root = useRef<HTMLDivElement>(null);
  const chapters = useRef<Chapter[]>([]);
  const navigate = useNavigate();
  const nav = useRef(navigate);
  nav.current = navigate;

  useEffect(() => {
    const sections = root.current!.querySelectorAll<HTMLElement>('section');
    chapters.current = IDS.flatMap((id, i) => {
      const make = FACTORIES[`./chapters/${id}.ts`];
      try {
        return make ? [make(sections[i])] : [];
      } catch (err) {
        console.error(`Wrapped chapter ${id}:`, err);
        return [];
      }
    });
    const goto = (e: Event) => nav.current((e as CustomEvent<string>).detail);
    bus.addEventListener('goto', goto);
    return () => {
      bus.removeEventListener('goto', goto);
      chapters.current.forEach(c => c.dispose());
      chapters.current = [];
    };
  }, []);

  useEffect(() => {
    const story = buildStory(data);
    if (!story) return;
    for (const c of chapters.current) {
      try {
        c.render(story);
      } catch (err) {
        console.error('Wrapped chapter render:', err);
      }
    }
  }, [data]);

  // The chapters write plain links; route the site's own through the router.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest('a');
    const href = a?.getAttribute('href');
    if (!href?.startsWith('/') || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };

  return (
    <div ref={root} className="ws" onClick={onClick}>
      {IDS.map(id => <section key={id} id={id} className="chapter" />)}
    </div>
  );
}
