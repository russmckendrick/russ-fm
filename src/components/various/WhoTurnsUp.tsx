import { useState } from 'react';
import { ArtistCard } from '@/components/ArtistCard';
import { SectionHeading } from '@/components/player';
import type { CompilationsData } from '@/lib/compilations';
import { getArtistImageFromData } from '@/lib/image-utils';

/** How many artists show before Show all. */
const FIRST = 18;

/**
 * The Various Artists page's cast: artists with a page of their own who play
 * on its compilations, most compilations first, then the most credited
 * artists without one as plain names.
 */
export function WhoTurnsUp({ data }: { data: CompilationsData }) {
  const [all, setAll] = useState(false);
  const cast = Object.entries(data.artists)
    .map(([uri, a]) => ({ uri, name: a.name, count: a.on.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (!cast.length) return null;
  const shown = all ? cast : cast.slice(0, FIRST);

  return (
    <section className="flex flex-col gap-10">
      <SectionHeading title="Who turns up" note={`${cast.length} artists with records of their own`} />
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {shown.map(a => (
          <ArtistCard
            key={a.uri}
            artist={{ name: a.name, uri: a.uri, albumCount: a.count, image: getArtistImageFromData(a.uri, 'medium') }}
            unit={['compilation', 'compilations']}
          />
        ))}
      </div>
      {!all && cast.length > FIRST && (
        <button type="button" className="pill self-center" onClick={() => setAll(true)}>
          Show all {cast.length}
        </button>
      )}
      {data.others.length > 0 && (
        <div className="flex flex-col gap-4">
          <span className="t-kicker text-[color:var(--cream-dim)]">And {data.others_count.toLocaleString('en-GB')} more without a page of their own</span>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {data.others.map(o => (
              <li key={o.name} className="rounded-full bg-[color:var(--ground-2)] px-3.5 py-1.5 text-[14px]">
                {o.name}
                {o.releases > 1 && <span className="t-mono ml-1.5 text-[11px] text-[color:var(--cream-dim)]">×{o.releases}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
