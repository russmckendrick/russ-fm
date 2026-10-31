import { RecordTile, SectionHeading } from '@/components/player';
import type { AlbumColorPalette } from '@/hooks/useAlbumColors';
import type { CompilationsData } from '@/lib/compilations';
import type { Album } from '@/types/album';

interface AlsoAppearsOnProps {
  /** The artist page, `/artist/{slug}/`. */
  artistUri: string;
  compilations: CompilationsData | null;
  collection: Album[];
  /** Records already in the artist's discography, left out here. */
  own: Set<string>;
  colourMap: Record<string, AlbumColorPalette> | null;
}

/**
 * Compilations an artist plays on (a track credit, not the record's credit),
 * under their discography, each with the tracks they play.
 */
export function AlsoAppearsOn({ artistUri, compilations, collection, own, colourMap }: AlsoAppearsOnProps) {
  const on = compilations?.artists[artistUri]?.on ?? [];
  const byUri = new Map(collection.map(a => [a.uri_release, a]));
  const records = on
    .filter(o => !own.has(o.release))
    .map(o => ({ album: byUri.get(o.release), tracks: o.tracks }))
    .filter((r): r is { album: Album; tracks: string[] } => !!r.album)
    .sort((a, b) => b.album.date_added.localeCompare(a.album.date_added));
  if (!records.length) return null;

  return (
    <section className="flex flex-col gap-10">
      <SectionHeading title="Also appears on" note={`${records.length} ${records.length === 1 ? 'compilation' : 'compilations'}`} />
      <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 md:gap-x-6 lg:grid-cols-4 xl:grid-cols-6">
        {records.map(({ album, tracks }) => (
          <RecordTile
            key={album.uri_release}
            album={album}
            palette={colourMap?.[album.uri_release]}
            showArtist={false}
            meta={<span title={tracks.join(' · ')}>{tracks.join(' · ')}</span>}
          />
        ))}
      </div>
    </section>
  );
}
