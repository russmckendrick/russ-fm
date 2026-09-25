import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import type { BoxDisc, BoxTrack } from '@/lib/boxDiscs';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { floodFor, type Flood } from '@/lib/sleeveColour';
import { toScrobbleTracks } from '@/lib/scrobbleTracks';
import { cn } from '@/lib/utils';
import { AlbumScrobbleButton } from '@/components/AlbumScrobbleButton';
import { Sleeve, Sticker, Vinyl } from '@/components/player';

interface BoxHeroArtProps {
  boxUri: string;
  boxTitle: string;
  discs: BoxDisc[];
  selected: number;
  onSelect: (i: number) => void;
  flood: Flood;
  added: string;
}

/** The box cover with a thick edge, and its albums fanned out behind it. */
export function BoxHeroArt({ boxUri, boxTitle, discs, selected, onSelect, flood, added }: BoxHeroArtProps) {
  const boxImage = getAlbumImageFromData(boxUri, 'hi-res');
  return (
    <div className="relative aspect-square w-[88%] lg:w-[82%]">
      {discs.map((d, k) => {
        const on = k === selected;
        // Offsets are % of the sleeve width so the fan scales with the box.
        const step = discs.length > 8 ? 2.4 : 3.4;
        const x = 5 + k * step + (on ? 18 : 0);
        const rot = -4 + k * 0.9;
        return (
          <button
            key={`${d.title}-${k}`}
            type="button"
            onClick={() => onSelect(k)}
            aria-label={`Pull out ${d.title}`}
            className="absolute left-[4%] top-[4%] h-[92%] w-[92%] origin-bottom overflow-hidden bg-[#111] shadow-[-10px_0_24px_rgba(0,0,0,.35)] transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{
              transform: `translateX(${x}%) translateY(${on ? -3 : 0}%) rotate(${on ? 1.5 : rot}deg)`,
              zIndex: on ? 15 : k + 1,
            }}
          >
            <img
              src={d.member ? getAlbumImageFromData(d.member.uri_release, 'medium') : getAlbumImageFromData(boxUri, 'medium')}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            {!d.member && (
              <span className="absolute inset-x-0 bottom-0 px-4 py-3 text-left" style={{ background: flood.ground, color: flood.flood }}>
                <span className="t-cond block text-[22px] leading-[.92] md:text-[30px]">{d.title}</span>
              </span>
            )}
          </button>
        );
      })}
      <div
        className="absolute inset-0 z-20"
        style={{
          boxShadow:
            '1px 1px 0 #2a2520,2px 2px 0 #1f1b17,3px 3px 0 #2a2520,4px 4px 0 #1f1b17,5px 5px 0 #2a2520,6px 6px 0 #1f1b17,7px 7px 0 #2a2520,8px 8px 0 #1f1b17,9px 9px 0 #2a2520,10px 10px 0 #1f1b17,11px 11px 0 #2a2520,12px 12px 0 #1f1b17,14px 14px 0 #14110e,0 50px 70px -20px rgba(0,0,0,.6)',
        }}
      >
        <img src={boxImage} alt={`${boxTitle} box set`} className="h-full w-full object-cover" fetchPriority="high" />
        <span className="shrinkwrap" aria-hidden />
      </div>
      <Sticker date={added} background={flood.ground} color={flood.flood} size="lg" className="-right-6 -top-6 hidden md:flex" />
      <Sticker date={added} background={flood.ground} color={flood.flood} size="sm" className="-right-3 -top-5 md:hidden" />
    </div>
  );
}

interface BoxContentsProps {
  boxUri: string;
  discs: BoxDisc[];
  selected: number;
  onSelect: (i: number) => void;
  colours: Record<string, AlbumColorPalette> | null;
  boxFlood: Flood;
  artist: string;
}

/** "In this box": pick a disc, its panel takes the sleeve's colour, tracklist and scrobble. */
export function BoxContents({ boxUri, discs, selected, onSelect, colours, boxFlood, artist }: BoxContentsProps) {
  const [scrobbling, setScrobbling] = useState(false);
  const disc = discs[selected];
  const f = disc?.member ? floodFor(colours?.[disc.member.uri_release]) : boxFlood;
  const sides = useMemo(() => {
    if (!disc) return [];
    const groups: Array<{ label: string; tracks: BoxTrack[] }> = [];
    disc.tracks.forEach(t => {
      const letter = (t.position ?? '').charAt(0);
      const label = /[A-Z]/i.test(letter) ? `Side ${letter.toUpperCase()}` : 'Tracks';
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.tracks.push(t);
      else groups.push({ label, tracks: [t] });
    });
    return groups;
  }, [disc]);
  const totalTracks = discs.reduce((n, d) => n + d.tracks.length, 0);
  if (!disc) return null;
  const longest = Math.max(...disc.title.split(/\s+/).map(w => w.length), 6);
  const sideRange = disc.sides.length > 1 ? `Sides ${disc.sides[0]}–${disc.sides[disc.sides.length - 1]}` : disc.sides.length ? `Side ${disc.sides[0]}` : '';

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h2 className="t-disp m-0 text-[34px] md:text-[48px]">In this box</h2>
        <span className="t-mono text-[13px] text-[color:var(--cream-dim)]">
          {discs.length} albums{totalTracks ? ` · ${totalTracks} tracks` : ''}
        </span>
      </div>

      <div role="tablist" aria-label="Albums in this box" className="shelf-scroll -mx-5 gap-4 px-5 pb-2 pt-4 md:mx-0 md:grid md:overflow-visible md:px-0" style={{ gridTemplateColumns: `repeat(${Math.min(discs.length, 10)}, minmax(0, 1fr))` }}>
        {discs.map((d, k) => {
          const on = k === selected;
          const bar = d.member ? floodFor(colours?.[d.member.uri_release]).flood : boxFlood.flood;
          return (
            <button
              key={`${d.title}-${k}`}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(k)}
              className={cn('flex w-[120px] shrink-0 flex-col gap-2.5 text-left transition-[transform,opacity] duration-300 md:w-auto', on ? '-translate-y-3' : 'opacity-70 hover:-translate-y-1.5 hover:opacity-100')}
            >
              <span className="sleeve relative block aspect-square w-full">
                <img src={getAlbumImageFromData(d.member?.uri_release ?? boxUri, 'medium')} alt="" loading="lazy" />
                {!d.member && (
                  <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-2 py-1.5" style={{ background: boxFlood.flood, color: boxFlood.ink }}>
                    <span className="t-mono text-[8px] font-bold tracking-[.1em]">FROM THE BOX</span>
                    <span className="t-cond text-[14px] leading-[.95]">{d.title}</span>
                  </span>
                )}
              </span>
              <span className="h-1 w-full" style={{ background: bar, opacity: on ? 1 : 0.5 }} aria-hidden />
              <span className="line-clamp-2 text-[13px] font-bold leading-snug">{d.title}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="flood-surface flex flex-col gap-10 rounded-[18px] p-6 md:p-10 lg:flex-row lg:gap-24 lg:p-12" style={{ background: f.flood, color: f.ink }}>
        <div className="flex w-[78%] max-w-[380px] shrink-0 flex-col gap-6 self-start lg:w-[340px]">
          <div className="relative aspect-square w-full">
            <Vinyl
              label={f.ground}
              fast={scrobbling}
              className="left-[2%] top-[2%] h-[96%] w-[96%] transition-transform duration-1000"
              style={{ transform: `translateX(${scrobbling ? 38 : 18}%)` }}
            />
            <Sleeve src={getAlbumImageFromData(disc.member?.uri_release ?? boxUri, 'hi-res')} alt={disc.title} shrinkwrap className="h-full w-full">
              {!disc.member && (
                <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-5 py-4" style={{ background: boxFlood.ground, color: boxFlood.flood }}>
                  <span className="t-mono text-[11px] font-bold tracking-[.12em]">FROM THE BOX{sideRange ? ` · ${sideRange.toUpperCase()}` : ''}</span>
                  <span className="t-cond text-[30px] leading-[.92] md:text-[38px]">{disc.title}</span>
                </span>
              )}
            </Sleeve>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {disc.tracks.length > 0 && (
              <AlbumScrobbleButton
                key={disc.title}
                album={{ artist, album: disc.title, tracks: toScrobbleTracks(disc.tracks) }}
                tone={{ background: f.ink, color: f.flood }}
                onActiveChange={setScrobbling}
              />
            )}
            {disc.member && (
              <Link to={disc.member.uri_release} className="pill">
                Open album page
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <span className="t-kicker">
            Album {selected + 1} of {discs.length}
          </span>
          <h3 className="t-cond m-0" style={{ fontSize: `clamp(40px, 7vw, ${Math.min(88, Math.floor(470 / (longest * 0.52)))}px)` }}>
            {disc.title}
          </h3>
          <div className="t-kicker flex flex-wrap gap-x-4 gap-y-1" style={{ color: f.sub }}>
            {!disc.member && <span>Box set disc</span>}
            {disc.tracks.length > 0 && <span>{disc.tracks.length} tracks</span>}
            {sideRange && <span>{sideRange}</span>}
          </div>
          {sides.length > 0 && (
            <div className="mt-2 grid gap-x-8 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {sides.map(s => (
                <div key={s.label} className="flex flex-col gap-2">
                  <span className="t-disp text-[20px]">{s.label}</span>
                  <ol className="m-0 list-none p-0">
                    {s.tracks.map((t, i) => (
                      <li key={`${t.position}-${i}`} className="flex gap-3 border-b py-2 text-[14px]" style={{ borderColor: f.ink === '#0e0d0c' ? 'rgba(14,13,12,.18)' : 'rgba(251,247,239,.2)' }}>
                        <span className="t-mono w-8 shrink-0 pt-0.5 text-[11px] font-bold opacity-70">{t.position}</span>
                        <span className="font-semibold">{t.name}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
