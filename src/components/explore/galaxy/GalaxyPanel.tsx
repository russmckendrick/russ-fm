import { forwardRef, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, X } from 'lucide-react';
import { artistPhotoUrl, fanartUrl, sleeveUrl } from '@/lib/explore/data';
import { THREAD_PATH } from '@/lib/explore/links';
import { TRAIL_KINDS, connectionGroups, leadRecord, type GalaxyPrep } from '@/lib/explore/galaxyLayout';
import type { ExploreData } from '@/lib/explore/types';
import { cn } from '@/lib/utils';
import { AtlasImage } from './AtlasImage';
import { avatarStyle, sleeveStyle } from './atlasStyle';

const SHOWN = 6;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export interface GalaxyPanelProps {
  data: ExploreData;
  prep: GalaxyPrep;
  artist: number;
  /** Artists visited on the way here, oldest first, ending with `artist`. */
  path: number[];
  phone: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onGo: (artist: number) => void;
  onClose: () => void;
}

/**
 * The focused artist: photo, plain facts, every connection with the reason,
 * and their records. On phones it is a bottom sheet that folds down to the
 * name. It is also the text alternative to the map.
 */
export const GalaxyPanel = forwardRef<HTMLElement, GalaxyPanelProps>(function GalaxyPanel(
  { data: d, prep, artist: i, path, phone, collapsed, onToggle, onGo, onClose },
  ref,
) {
  const a = d.artists[i];
  const lead = leadRecord(d, i);
  const flood = lead != null ? d.albums[lead] : null;
  const groups = useMemo(() => connectionGroups(d, prep, i), [d, prep, i]);
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const records = useMemo(() => [...a.records].sort((x, y) => (d.albums[x].y ?? 9999) - (d.albums[y].y ?? 9999)), [a, d]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const hero = fanartUrl(a) ?? artistPhotoUrl(a, 'medium');
  const life = a.formed ? `Formed ${a.formed}` : a.born ? `Born ${a.born}` : null;
  const meta = [a.from, life, a.died ? `Died ${a.died}` : null, plural(a.records.length, 'record')].filter(Boolean) as string[];
  const family = d.families[prep.fam[i]];

  return (
    <aside
      ref={ref}
      aria-label={`${a.name}: details and connections`}
      className={cn(
        'absolute z-20 flex flex-col overflow-hidden rounded-[26px] bg-[color:var(--ground-2)] text-[color:var(--cream)] shadow-[0_40px_80px_-24px_rgba(0,0,0,.7)]',
        phone ? 'inset-x-2 bottom-2 max-h-[46%]' : 'bottom-4 right-4 top-4 w-[400px]',
        phone && collapsed && 'max-h-[92px]',
      )}
    >
      {phone && (
        <button type="button" onClick={onToggle} className="flex h-6 w-full shrink-0 items-center justify-center" aria-label={collapsed ? 'Show details' : 'Hide details'} aria-expanded={!collapsed}>
          <span className="h-1 w-10 rounded-full bg-[color:var(--cream-rule)]" />
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!phone && (
          <div className="relative aspect-[16/9] w-full overflow-hidden" style={{ background: flood?.gr ?? 'var(--ground-3)' }}>
            <img
              key={a.slug}
              src={hero}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: a.focus ? `${a.focus[0] * 100}% ${a.focus[1] * 100}%` : '50% 30%' }}
              onError={e => ((e.currentTarget.parentElement as HTMLElement).style.display = 'none')}
            />
          </div>
        )}
        <div className="relative px-5 pb-5 pt-4 md:px-6" style={flood ? { background: flood.fl, color: flood.ink } : undefined}>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn absolute right-3 top-3 h-10 w-10 border-2 border-current"
            aria-label="Close and see the whole map"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <p className="t-kicker m-0 pr-12 opacity-75">
            {family.code} · {family.name}
          </p>
          <h2 className="t-disp m-0 mt-2 pr-12 text-[24px] leading-[0.95] md:text-[34px]">{a.name}</h2>
          <p className="t-mono m-0 mt-3 text-[12px] opacity-80">{meta.join(' · ')}</p>
        </div>

        <div className="px-5 pb-6 pt-4 md:px-6">
          {path.length > 1 && (
            <nav aria-label="Where you have been">
              <ol className="t-mono m-0 mb-4 flex list-none flex-wrap gap-x-2 gap-y-1 p-0 text-[11px] text-[color:var(--cream-dim)]">
                {path.map((p, n) => (
                  <li key={`${p}-${n}`} className="flex items-center gap-2">
                    {n > 0 && <span aria-hidden>›</span>}
                    {p === i ? (
                      <span aria-current="page" className="text-[color:var(--cream)]">
                        {d.artists[p].name}
                      </span>
                    ) : (
                      <button type="button" onClick={() => onGo(p)} className="underline-offset-2 hover:text-[color:var(--cream)] hover:underline">
                        {d.artists[p].name}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className="flex flex-wrap gap-2">
            <Link to={`${THREAD_PATH}?seed=${a.slug}`} className="pill pill-sm">
              Follow the thread from here
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to={`/artist/${a.slug}`} className="pill pill-sm">
              Artist page
            </Link>
          </div>

          {a.bio && <p className="m-0 mt-4 text-[14px] leading-[1.6] text-[color:var(--cream-dim)]">{a.bio}</p>}

          {a.members.length > 0 && (
            <>
              <h3 className="t-kicker m-0 mt-6 text-[color:var(--cream-dim)]">Members</h3>
              <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[13px]">
                {a.members.map(m => (
                  <li key={m}>{m.replace(/\s*\(\d+\)$/, '')}</li>
                ))}
              </ul>
            </>
          )}

          <h3 className="t-kicker m-0 mt-6 text-[color:var(--cream-dim)]">Connected to{total ? ` (${total})` : ''}</h3>
          {!total && <p className="m-0 mt-2 text-[13px] text-[color:var(--cream-dim)]">No shared members, guest spots or credits with other artists in the collection.</p>}
          {groups.map(g => {
            const kind = TRAIL_KINDS[g.kind];
            const all = open[kind.key] || g.items.length <= SHOWN + 1;
            return (
              <section key={kind.key} className="mt-3">
                <h4 className="t-mono m-0 flex items-center gap-2 text-[11px] uppercase tracking-[0.06em] text-[color:var(--cream-dim)]">
                  <span className="h-0.5 w-4 rounded-full" style={{ background: kind.colour }} aria-hidden />
                  {kind.label} · {g.items.length}
                </h4>
                <ul className="m-0 mt-1 list-none p-0">
                  {(all ? g.items : g.items.slice(0, SHOWN)).map(c => (
                    <li key={c.link} className="border-t border-[color:var(--cream-rule)] first:border-t-0">
                      <button
                        type="button"
                        onClick={() => onGo(c.other)}
                        className="group flex w-full gap-3 rounded-[10px] px-1 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--cream)]"
                      >
                        <AtlasImage
                          src={artistPhotoUrl(d.artists[c.other], 'avatar')}
                          atlas={avatarStyle(d, c.other)}
                          className="mt-0.5 h-9 w-9 shrink-0 rounded-full"
                          style={{ boxShadow: `0 0 0 2px ${kind.colour}` }}
                        />
                        <span className="min-w-0">
                          <span className="block text-[15px] font-bold leading-tight group-hover:underline group-hover:underline-offset-2">{d.artists[c.other].name}</span>
                          {c.lines.map(t => (
                            <span key={t} className="mt-0.5 block text-[12.5px] leading-snug text-[color:var(--cream-dim)]">
                              {t}
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {!all && (
                  <button type="button" onClick={() => setOpen(o => ({ ...o, [kind.key]: true }))} className="pill pill-sm mt-1 min-h-[34px] px-3 text-[12px]">
                    Show all {g.items.length}
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </section>
            );
          })}

          <h3 className="t-kicker m-0 mt-6 text-[color:var(--cream-dim)]">In the collection ({records.length})</h3>
          <ul className="m-0 mt-2 grid list-none grid-cols-6 gap-1 p-0">
            {records.slice(0, 36).map(r => {
              const al = d.albums[r];
              return (
                <li key={r}>
                  <Link
                    to={`/album/${al.slug}`}
                    title={`${al.t}${al.y ? ` (${al.y})` : ''}`}
                    aria-label={`${al.t}${al.y ? `, ${al.y}` : ''}`}
                    className="block rounded-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--cream)]"
                  >
                    <AtlasImage src={sleeveUrl(al, 'medium')} atlas={sleeveStyle(d, r)} className="aspect-square rounded-[3px]" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {records.length > 36 && (
            <Link to={`/artist/${a.slug}`} className="t-mono mt-2 inline-block text-[12px] text-[color:var(--cream-dim)] underline underline-offset-2">
              All {records.length} on the artist page
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
});
