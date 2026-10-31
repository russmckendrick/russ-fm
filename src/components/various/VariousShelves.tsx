import { useMemo, useState } from 'react';
import { RecordTile, SectionHeading } from '@/components/player';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import { SHELVES, isVarious, shelfOf, type CompilationsData, type Shelf } from '@/lib/compilations';
import { originalYear } from '@/lib/releaseYear';
import { cn } from '@/lib/utils';
import type { Album } from '@/types/album';

type ShelfAlbum = Pick<Album, 'uri_release' | 'release_name' | 'release_artist' | 'vinyl_colours' | 'genre_names' | 'styles' | 'year_original' | 'date_release_year'>;

interface VariousShelvesProps {
  /** Every compilation, newest additions first. */
  albums: ShelfAlbum[];
  compilations: CompilationsData | null;
  colourMap: Record<string, AlbumColorPalette> | null;
}

/** How many tiles show before Show all. */
const FIRST = 24;

/**
 * The Various Artists page's records, on shelves: All, then Soundtracks,
 * Anthologies, Series and Tributes (shelfOf), each newest additions first.
 */
export function VariousShelves({ albums, compilations, colourMap }: VariousShelvesProps) {
  const [shelf, setShelf] = useState<Shelf | 'all'>('all');
  const [all, setAll] = useState(false);
  const shelved = useMemo(() => albums.map(album => ({ album, shelf: shelfOf(album) })), [albums]);
  const tabs = [
    { key: 'all' as const, label: 'All', count: albums.length },
    ...SHELVES.map(s => ({ key: s.key, label: s.label, count: shelved.filter(x => x.shelf === s.key).length })).filter(s => s.count > 0),
  ];
  const shown = shelved.filter(x => shelf === 'all' || x.shelf === shelf);
  const blurb = SHELVES.find(s => s.key === shelf)?.blurb;

  return (
    <section className="flex flex-col gap-10">
      <SectionHeading title="The shelves" note={blurb ?? `${albums.length} records · newest additions first`}>
        <div role="group" aria-label="Shelf" className="flex flex-wrap gap-1 rounded-[24px] bg-[color:var(--ground-2)] p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              aria-pressed={shelf === t.key}
              onClick={() => {
                setShelf(t.key);
                setAll(false);
              }}
              className={cn(
                'flex h-10 items-baseline gap-2 rounded-full px-4 pt-2.5 text-[14px] font-bold transition-colors',
                shelf === t.key ? 'bg-[color:var(--cream)] text-[color:var(--ground)]' : 'hover:bg-[color:var(--ground-3)]',
              )}
            >
              {t.label}
              <span className="t-mono text-[11px] opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      </SectionHeading>
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:gap-x-6 lg:grid-cols-4 xl:grid-cols-6">
        {(all ? shown : shown.slice(0, FIRST)).map(({ album, shelf: s }) => {
          const credited = compilations?.releases[album.uri_release]?.artists;
          return (
            <RecordTile
              key={album.uri_release}
              album={album}
              palette={colourMap?.[album.uri_release]}
              showArtist={!isVarious(album.release_artist)}
              meta={[
                shelf === 'all' ? SHELVES.find(x => x.key === s)?.one : null,
                credited ? `${credited} artists` : null,
                originalYear(album),
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          );
        })}
      </div>
      {!all && shown.length > FIRST && (
        <button type="button" className="pill self-center" onClick={() => setAll(true)}>
          Show all {shown.length}
        </button>
      )}
    </section>
  );
}
