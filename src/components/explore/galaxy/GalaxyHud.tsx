import { useId, useMemo, useState } from 'react';
import { Map as MapIcon, Search, Shuffle } from 'lucide-react';
import { TRAIL_KINDS, searchArtists, type GalaxyPrep } from '@/lib/explore/galaxyLayout';
import type { ExploreData } from '@/lib/explore/types';
import { artistPhotoUrl } from '@/lib/explore/data';
import { AtlasImage } from './AtlasImage';
import { avatarStyle } from './atlasStyle';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export interface GalaxyHudProps {
  data: ExploreData;
  prep: GalaxyPrep;
  phone: boolean;
  showHint: boolean;
  onGo: (artist: number) => void;
  onRandom: () => void;
  onHome: () => void;
  /** The title and search block, so the map can keep labels out of it. */
  boxRef?: (el: HTMLDivElement | null) => void;
}

/** Title, artist search, Random and Whole map, and the key to the trail colours. */
export function GalaxyHud({ data: d, prep, phone, showHint, onGo, onRandom, onHome, boxRef }: GalaxyHudProps) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [focused, setFocused] = useState(false);
  const results = useMemo(() => searchArtists(d, prep, query), [d, prep, query]);
  const listId = useId();
  const open = focused && results.length > 0;

  const pick = (i: number) => {
    setQuery('');
    setSel(0);
    (document.activeElement as HTMLElement | null)?.blur();
    onGo(i);
  };

  return (
    <>
      <div ref={boxRef} className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex flex-col gap-3 md:left-6 md:right-auto md:top-5 md:w-[380px]">
        <div className="pointer-events-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 [text-shadow:0_0_8px_#000]">
          <h1 className="t-disp m-0 text-[24px] md:text-[32px]">The Galaxy</h1>
          <span className="t-mono text-[11px] text-[color:var(--cream-dim)] md:text-[12px]">
            {plural(prep.visible, 'artist')} · {plural(prep.links.length, 'connection')}
          </span>
        </div>
        <div className="pointer-events-auto relative flex gap-2">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border-2 border-[color:var(--cream-rule)] bg-[color:var(--ground)] px-4 focus-within:border-[color:var(--cream)]">
            <Search className="h-[18px] w-[18px] shrink-0 opacity-70" aria-hidden />
            <input
              type="search"
              value={query}
              placeholder="Find an artist"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-label="Find an artist on the map"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open ? `${listId}-${sel}` : undefined}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              onChange={e => {
                setQuery(e.target.value);
                setSel(0);
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown' && results.length) {
                  setSel(s => (s + 1) % results.length);
                  e.preventDefault();
                } else if (e.key === 'ArrowUp' && results.length) {
                  setSel(s => (s - 1 + results.length) % results.length);
                  e.preventDefault();
                } else if (e.key === 'Enter' && results.length) {
                  pick(results[Math.min(sel, results.length - 1)]);
                  e.preventDefault();
                } else if (e.key === 'Escape') {
                  setQuery('');
                  e.currentTarget.blur();
                  e.stopPropagation();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[color:var(--cream-dim)] [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
          <button type="button" onClick={onRandom} className="icon-btn h-11 w-11 border-2 border-[color:var(--cream-rule)] bg-[color:var(--ground)] hover:border-[color:var(--cream)]" aria-label="Go to a random artist with connections" title="Random artist">
            <Shuffle className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button type="button" onClick={onHome} className="icon-btn h-11 w-11 border-2 border-[color:var(--cream-rule)] bg-[color:var(--ground)] hover:border-[color:var(--cream)]" aria-label="See the whole map" title="Whole map">
            <MapIcon className="h-[18px] w-[18px]" aria-hidden />
          </button>
          {open && (
            <ul id={listId} role="listbox" aria-label="Artists" className="absolute left-0 right-0 top-[52px] m-0 max-h-[60vh] list-none overflow-y-auto rounded-[22px] bg-[color:var(--ground-2)] p-2 shadow-[0_30px_60px_-20px_rgba(0,0,0,.8)]">
              {results.map((i, n) => (
                <li
                  key={i}
                  id={`${listId}-${n}`}
                  role="option"
                  aria-selected={n === sel}
                  onPointerDown={e => {
                    e.preventDefault();
                    pick(i);
                  }}
                  onPointerEnter={() => setSel(n)}
                  className="flex cursor-pointer items-center gap-3 rounded-[14px] px-2.5 py-2 aria-selected:bg-[color:var(--ground-3)]"
                >
                  <AtlasImage src={artistPhotoUrl(d.artists[i], 'avatar')} atlas={avatarStyle(d, i)} className="h-8 w-8 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{d.artists[i].name}</span>
                  <span className="t-mono shrink-0 text-[11px] text-[color:var(--cream-dim)]">
                    {d.families[prep.fam[i]].code} · {d.artists[i].records.length}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!phone && (
          <ul className="t-mono pointer-events-auto m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[10.5px] uppercase tracking-[0.05em] text-[color:var(--cream-dim)] [text-shadow:0_0_6px_#000]" aria-label="Trail colours">
            {TRAIL_KINDS.map(k => (
              <li key={k.key} className="flex items-center gap-2" title={'note' in k ? k.note : undefined}>
                <span className="h-0.5 w-4 rounded-full" style={{ background: k.colour }} aria-hidden />
                {k.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {showHint && !phone && (
        <p className="t-mono pointer-events-none absolute bottom-5 left-6 z-10 m-0 text-[11px] text-[color:var(--cream-dim)] opacity-80">
          Drag to turn · scroll to zoom · click a star
        </p>
      )}
    </>
  );
}
