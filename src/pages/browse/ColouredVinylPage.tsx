import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrowseHeader } from '@/components/browse/BrowseHeader';
import { byDateAddedDesc } from '@/components/browse/facetSleeves';
import { EditorialEmpty, EditorialSkeleton, PageContainer } from '@/components/layout';
import { FloodBand, Vinyl, useRecordsFlood } from '@/components/player';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMetaTags } from '@/hooks/useMetaTags';
import { useAlbumColorMap } from '@/hooks/useAlbumColors';
import { appConfig } from '@/config/app.config';
import { excludeBoxsetMembers } from '@/lib/boxsets';
import { useCollection } from '@/lib/collection';
import { getAlbumImageFromData } from '@/lib/image-utils';
import { floodFor } from '@/lib/sleeveColour';
import { cn } from '@/lib/utils';
import { COLOUR_FAMILIES, PATTERN_TAGS, colourTags, discLooks } from '@/lib/vinylLook';
import type { Album } from '@/types/album';

/** Records shown at first, and added by each "Show more". */
const PAGE = 60;
/** A set is drawn as up to this many discs, fanned out behind the first. */
const MAX_DISCS = 3;

/**
 * Every coloured pressing in the collection, drawn as the record itself: a
 * still disc in its real colour (patterns and all) with the sleeve printed on
 * the label. Filter by colour family or pattern; the choice is in the URL
 * (`?colour=Red`) so a filtered view can be linked.
 */
export function ColouredVinylPage() {
  usePageTitle('Coloured vinyl | Russ.fm');
  useMetaTags({
    title: 'Coloured vinyl | Russ.fm',
    description: 'Every coloured, clear and splatter pressing in the collection, drawn as the record.',
    image: `${appConfig.siteUrl}/og-image.png`,
    url: `${appConfig.siteUrl}/coloured-vinyl`,
    type: 'website',
  });

  const { albums: raw, loading, error } = useCollection();
  const colorMap = useAlbumColorMap();
  const [params, setParams] = useSearchParams();
  const tag = params.get('colour') ?? 'all';
  const [shown, setShown] = useState({ tag, count: PAGE });
  // Each filter starts from the first page again.
  const visibleCount = shown.tag === tag ? shown.count : PAGE;

  const records = useMemo(() => {
    const coloured = excludeBoxsetMembers(raw).filter(a => a.vinyl_colours?.length);
    const tagged = coloured.map(album => ({ album, tags: new Set(album.vinyl_colours!.flatMap(colourTags)) }));
    return tagged.sort((a, b) => byDateAddedDesc(a.album, b.album));
  }, [raw]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const { tags } of records) for (const t of tags) c.set(t, (c.get(t) ?? 0) + 1);
    return c;
  }, [records]);

  const filtered = useMemo(
    () => (tag === 'all' ? records : records.filter(r => r.tags.has(tag))).map(r => r.album),
    [records, tag],
  );
  const visible = filtered.slice(0, visibleCount);

  // The header band and page ground take the colours of the first records shown.
  const flood = useRecordsFlood(filtered.map(a => a.uri_release));

  const choose = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('colour');
    else p.set('colour', next);
    setParams(p, { replace: true });
  };

  if (loading) {
    return (
      <PageContainer>
        <EditorialSkeleton label="Loading collection…" />
      </PageContainer>
    );
  }

  if (error || records.length === 0) {
    return (
      <PageContainer>
        <EditorialEmpty title="No coloured vinyl" detail={error ?? 'No pressing in the collection has a recorded colour.'} />
      </PageContainer>
    );
  }

  const chips = [
    ...COLOUR_FAMILIES.map(f => ({ name: f.name, dot: f.colour })),
    ...PATTERN_TAGS.map(name => ({ name, dot: null as string | null })),
  ].filter(chip => counts.get(chip.name));

  return (
    <>
      <FloodBand flood={flood}>
        <BrowseHeader
          className="mb-0 md:mb-0"
          title="Coloured vinyl"
          current="coloured"
          note={`${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'record' : 'records'}`}
        />
      </FloodBand>

      <PageContainer>
        {/* One scrolling row on a phone (so the discs stay in view), wrapping from md up. */}
        <div
          role="group"
          aria-label="Colour"
          className="-mx-5 mb-8 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:mb-14 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [&>button]:shrink-0"
        >
          <FilterChip label="All" count={records.length} on={tag === 'all'} onClick={() => choose('all')} />
          {chips.map(chip => (
            <FilterChip
              key={chip.name}
              label={chip.name}
              dot={chip.dot}
              count={counts.get(chip.name) ?? 0}
              on={tag === chip.name}
              onClick={() => choose(tag === chip.name ? 'all' : chip.name)}
            />
          ))}
        </div>

        {filtered.length === 0 ? (
          <EditorialEmpty title="Nothing here" detail="No coloured pressing matches that filter." />
        ) : (
          <>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-10 p-0 sm:grid-cols-3 md:grid-cols-4 md:gap-x-6 lg:grid-cols-5 xl:grid-cols-6">
              {visible.map(album => (
                <li key={album.uri_release} className="min-w-0">
                  <DiscTile album={album} ground={floodFor(colorMap?.[album.uri_release]).ground} />
                </li>
              ))}
            </ul>

            {visible.length < filtered.length && (
              <div className="mt-14 flex justify-center">
                <button
                  type="button"
                  className="pill"
                  onClick={() => setShown({ tag, count: visibleCount + PAGE })}
                >
                  Show more
                  <span className="t-mono text-[11px] text-[color:var(--cream-dim)]">
                    {(filtered.length - visible.length).toLocaleString('en-GB')} left
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </PageContainer>
    </>
  );
}

function FilterChip({ label, count, dot, on, onClick }: { label: string; count: number; dot?: string | null; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('pill pill-sm', on ? 'border-[color:var(--cream)]' : 'border-[color:var(--ground-3)]')}
    >
      {dot && <span className="h-3 w-3 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,.25)]" style={{ background: dot }} aria-hidden />}
      {label}
      <span className="t-mono text-[11px] text-[color:var(--cream-dim)]">{count.toLocaleString('en-GB')}</span>
    </button>
  );
}

/**
 * One coloured pressing as a still record with the sleeve on its label. A set
 * of several colours shows up to three discs, the first in front with the
 * others fanned out behind it, each in its own colour.
 */
function DiscTile({ album, ground }: { album: Album; ground: string }) {
  const colours = album.vinyl_colours ?? [];
  const looks = discLooks(colours).slice(0, MAX_DISCS);
  const n = Math.max(1, looks.length);
  const step = 12;
  const size = 100 - (n - 1) * step;
  const title = album.release_name.trim();

  return (
    <Link to={album.uri_release} className="block min-w-0" aria-label={`${title} by ${album.release_artist}, ${colours.join(' and ')}`}>
      <div className="relative aspect-square w-full" aria-hidden>
        {/* Deepest disc first, so each sits over the one behind it. */}
        {[...looks.keys()].reverse().map(k => (
          <Vinyl
            key={k}
            label={ground}
            cover={k === 0 ? getAlbumImageFromData(album.uri_release, 'medium') : null}
            look={looks[k]}
            spin={false}
            className="vinyl-wide"
            style={{ left: `${k * step}%`, top: `${(100 - size) / 2}%`, width: `${size}%`, height: `${size}%`, zIndex: n - k }}
          />
        ))}
      </div>
      <div className="mt-3 flex min-w-0 flex-col gap-1">
        <span className="truncate text-[15px] font-bold leading-snug">{title}</span>
        <span className="truncate text-[14px] text-[color:var(--cream-dim)]">{album.release_artist}</span>
        <span className="t-mono line-clamp-2 text-[11px] uppercase text-[color:var(--cream-dim)]">{colours.join(' · ')}</span>
      </div>
    </Link>
  );
}
