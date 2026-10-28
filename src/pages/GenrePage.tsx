import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { VinylRecord } from "@phosphor-icons/react";
import { BrowseHeader } from "@/components/browse/BrowseHeader";
import type { ColourMap } from "@/components/browse/facetSleeves";
import { GenreDisc } from "@/components/genres/GenreDisc";
import { genreFlood, genreLead } from "@/components/genres/genreColours";
import { AllDetail, FamilyDetail, FamilyList, LitDetail } from "@/components/genres/GenreRecord";
import { EditorialEmpty, EditorialSkeleton, PageContainer } from "@/components/layout";
import {
  FloodBand,
  RecordTile,
  SectionHeading,
  bandFromFlood,
  recordsFlood,
  usePageBand,
} from "@/components/player";
import { appConfig } from "@/config/app.config";
import { useMetaTags } from "@/hooks/useMetaTags";
import { useAlbumColorMap } from "@/hooks/useAlbumColors";
import { usePageTitle } from "@/hooks/usePageTitle";
import { slugify } from "@/lib/browseFacets";
import { excludeBoxsetMembers } from "@/lib/boxsets";
import { loadCollection } from "@/lib/collection";
import { getGenreExplorer } from "@/lib/genreExplorer";
import type { GenreSummary } from "@/lib/genreExplorer";
import { buildGenreFamilies, isGenreFamilyKey, type GenreFamilyKey } from "@/lib/genreFamilies";
import { getAlbumImageFromData, handleImageError } from "@/lib/image-utils";
import { originalYear } from "@/lib/releaseYear";
import { floodFor, type Flood } from "@/lib/sleeveColour";
import { cn } from "@/lib/utils";
import type { Album } from "@/types/album";

interface GenreIndexGroup {
  initial: string;
  genres: GenreSummary[];
}

/** Explorer album uris drop the trailing slash that collection uris keep. */
const bareUri = (uri: string) => uri.replace(/\/$/, "");

/** The boldest of a list's first three records, as the page band does it. */
function leadRecord(albums: Album[], map: ColourMap): Album | null {
  const lead = albums.slice(0, 3);
  let pick = lead[0] ?? null;
  for (const album of lead) {
    if ((map?.[album.uri_release]?.vivid ?? 0) > (map?.[pick?.uri_release ?? ""]?.vivid ?? 0)) pick = album;
  }
  return pick;
}

export function GenrePage() {
  const [collection, setCollection] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colorMap = useAlbumColorMap();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const familyParam = searchParams.get("family");
  const genreParam = searchParams.get("genre");

  useEffect(() => {
    const loadData = async () => {
      try {
        setError(null);
        const data = await loadCollection();
        setCollection(Array.isArray(data) ? excludeBoxsetMembers(data) : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const explorer = useMemo(() => getGenreExplorer(collection), [collection]);
  const families = useMemo(() => buildGenreFamilies(collection, colorMap), [collection, colorMap]);
  const newest = useMemo(
    () => [...collection].sort((a, b) => (b.date_added || "").localeCompare(a.date_added || "")),
    [collection],
  );

  const selectedFamily = useMemo(
    () => (isGenreFamilyKey(familyParam) ? families.find((f) => f.key === familyParam) ?? null : null),
    [families, familyParam],
  );
  const litGenre = useMemo(() => {
    if (!genreParam || selectedFamily) return null;
    const wanted = decodeURIComponent(genreParam).toLowerCase();
    return explorer.genres.find((genre) => genre.name.toLowerCase() === wanted) ?? null;
  }, [explorer.genres, genreParam, selectedFamily]);

  const litUris = useMemo(
    () => (litGenre ? new Set(litGenre.albums.map((album) => bareUri(album.uri))) : null),
    [litGenre],
  );
  const lit = useMemo(
    () => (litUris ? (album: Album) => litUris.has(bareUri(album.uri_release)) : null),
    [litUris],
  );
  const litSpread = useMemo(() => {
    if (!lit) return [];
    return families
      .map((family) => ({ family, count: family.albums.filter(lit).length }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [families, lit]);

  // What the record shows decides the page colour and the sleeve on its label:
  // the picked family's boldest new record, a lit genre's lead, or the newest additions.
  const { band, labelAlbum } = useMemo(() => {
    if (selectedFamily) {
      const lead = leadRecord(selectedFamily.newest, colorMap);
      return { band: recordsFlood(selectedFamily.newest.map((a) => a.uri_release), colorMap), labelAlbum: lead?.uri_release ?? null };
    }
    if (litGenre) {
      const { flood, lead } = genreLead(litGenre, colorMap);
      return { band: bandFromFlood(flood), labelAlbum: lead ? `${bareUri(lead.uri)}/` : null };
    }
    const lead = leadRecord(newest, colorMap);
    return { band: recordsFlood(newest.map((a) => a.uri_release), colorMap), labelAlbum: lead?.uri_release ?? null };
  }, [colorMap, litGenre, newest, selectedFamily]);
  usePageBand(band);

  const labelFlood = floodFor(labelAlbum ? colorMap?.[labelAlbum] : null);
  const shelf = useMemo(() => {
    if (selectedFamily) return selectedFamily.newest;
    if (lit) return newest.filter(lit);
    return newest;
  }, [lit, newest, selectedFamily]);

  usePageTitle(
    selectedFamily
      ? `${selectedFamily.name} | Genres | Russ.fm`
      : litGenre
        ? `${litGenre.name} | Genres | Russ.fm`
        : "Genres | Russ.fm",
  );
  useMetaTags({
    title: "Genres | Russ.fm",
    description: "The russ.fm collection drawn as a record: every album in its sleeve colour, in twelve genre families, with ranked genres and an A–Z.",
    image: `${appConfig.siteUrl}/og-image.png`,
    url: `${appConfig.siteUrl}/genres`,
    type: "website",
    canonical: `${appConfig.siteUrl}/genres`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${appConfig.siteUrl}/genres`,
      url: `${appConfig.siteUrl}/genres`,
      name: "Genres | Russ.fm",
      description: "Browse the russ.fm collection by genre and style.",
    },
  });

  const setView = useCallback(
    (view: { family?: GenreFamilyKey | null; genre?: string | null }) => {
      const params = new URLSearchParams(searchParams);
      params.delete("family");
      params.delete("genre");
      if (view.family) params.set("family", view.family);
      if (view.genre) params.set("genre", view.genre);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const selectFamily = useCallback((key: GenreFamilyKey | null) => setView({ family: key }), [setView]);
  const lightGenre = useCallback((name: string) => setView({ genre: name }), [setView]);
  const clearView = useCallback(() => setView({}), [setView]);
  const showOnRecord = useCallback(
    (genre: GenreSummary) => {
      lightGenre(genre.name);
      document.getElementById("genre-record")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [lightGenre],
  );
  const shuffleFrom = useCallback(
    (albums: Album[]) => {
      if (!albums.length) return;
      navigate(albums[Math.floor(Math.random() * albums.length)].uri_release);
    },
    [navigate],
  );

  if (loading) {
    return (
      <PageContainer>
        <EditorialSkeleton label="Loading genres…" />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <EditorialEmpty title="Genres failed to load" detail={error} />
      </PageContainer>
    );
  }

  if (!collection.length) {
    return (
      <PageContainer>
        <EditorialEmpty title="No genre data" detail="The collection did not include usable genre metadata." />
      </PageContainer>
    );
  }

  const shelfTitle = selectedFamily
    ? `Newest in ${selectedFamily.name}`
    : litGenre
      ? `Newest in ${litGenre.name}`
      : "Latest additions";

  return (
    <>
      <FloodBand flood={band} innerClassName="pb-0 md:pb-0">
        <div id="genre-record" className="grid scroll-mt-28 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
          <div className="min-w-0 pb-8 md:pb-14">
            {/* The title shares its row with the record from lg, so it steps
                down until there is room for the full 112px. */}
            <BrowseHeader
              className="mb-8 md:mb-10 lg:[&_h1]:text-[80px] 2xl:[&_h1]:text-[112px]"
              title="Genres"
              note={`${formatNumber(collection.length)} records · ${families.length} families · ${formatNumber(explorer.genres.length)} genres`}
              current="genres"
            />
            {selectedFamily ? (
              <FamilyDetail
                family={selectedFamily}
                onLight={lightGenre}
                onShuffle={() => shuffleFrom(selectedFamily.albums)}
                onClear={clearView}
              />
            ) : litGenre && lit ? (
              <LitDetail
                name={litGenre.name}
                path={`/genre/${slugify(litGenre.name)}`}
                count={litGenre.albumCount}
                artistCount={litGenre.artistCount}
                yearStart={litGenre.yearStart}
                yearEnd={litGenre.yearEnd}
                spread={litSpread}
                ink={band?.ink ?? "#0e0d0c"}
                flood={band?.background ?? "#e8e2d6"}
                onShuffle={() => shuffleFrom(newest.filter(lit))}
                onClear={clearView}
              />
            ) : (
              <AllDetail
                total={collection.length}
                artistCount={explorer.totalArtists}
                yearStart={explorer.yearStart}
                yearEnd={explorer.yearEnd}
                topTerms={explorer.genres.slice(0, 8).map((g) => ({ name: g.name, count: g.albumCount }))}
                onLight={lightGenre}
                onShuffle={() => shuffleFrom(collection)}
              />
            )}
          </div>

          {/* Stacked, the record hangs over the next section like a hero
              cover; beside the text it sits inside the band, whose height
              the text decides. */}
          <div className="mx-auto -mb-24 w-full max-w-[760px] md:-mb-40 lg:mb-0 lg:pb-12">
            <GenreDisc
              families={families}
              colorMap={colorMap}
              selected={selectedFamily?.key ?? null}
              lit={lit}
              labelCover={labelAlbum ? getAlbumImageFromData(labelAlbum, "medium") : null}
              labelColour={labelFlood.ground}
              onSelect={selectFamily}
              onOpen={(album) => navigate(album.uri_release)}
            />
          </div>
        </div>
      </FloodBand>

      <PageContainer className="pb-16">
        <div className="mb-16 grid items-start gap-12 pt-28 md:mb-24 md:pt-44 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pt-14">
          <FamilyList families={families} selected={selectedFamily?.key ?? null} colorMap={colorMap} onSelect={selectFamily} />
          <div className="min-w-0">
            <p className="t-mono m-0 mb-8 text-[12px] uppercase leading-relaxed text-[color:var(--cream-dim)]">
              One tile per record, in its sleeve colour · oldest at the rim, newest by the label
            </p>
            <SectionHeading
              title={shelfTitle}
              size="sm"
              className="mb-6"
              note={selectedFamily ? `${formatNumber(selectedFamily.albums.length)} records` : undefined}
              link={
                selectedFamily
                  ? undefined
                  : litGenre
                    ? { to: `/genre/${slugify(litGenre.name)}`, label: `All ${formatNumber(litGenre.albumCount)}` }
                    : { to: "/albums/1", label: "All albums" }
              }
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
              {shelf.slice(0, 6).map((album) => (
                <RecordTile
                  key={album.uri_release}
                  album={album}
                  palette={colorMap?.[album.uri_release]}
                  meta={[originalYear(album), formatAdded(album.date_added)].filter(Boolean).join(" · ")}
                />
              ))}
            </div>
          </div>
        </div>

        <GenreAtlas
          genres={explorer.genres}
          litGenre={litGenre}
          colorMap={colorMap}
          onShowOnRecord={showOnRecord}
        />
      </PageContainer>
    </>
  );
}

function formatAdded(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function GenreAtlas({
  genres,
  litGenre,
  colorMap,
  onShowOnRecord,
}: {
  genres: GenreSummary[];
  litGenre: GenreSummary | null;
  colorMap: ColourMap;
  onShowOnRecord: (genre: GenreSummary) => void;
}) {
  const topGenres = genres.slice(0, 12);
  const maxAlbums = topGenres[0]?.albumCount || 1;
  const indexGroups = useMemo(() => groupGenreIndex(genres), [genres]);
  const selectedInitial = litGenre ? getGenreInitial(litGenre.name) : indexGroups[0]?.initial;
  const [activeInitial, setActiveInitial] = useState(() => {
    return indexGroups.some((group) => group.initial === selectedInitial)
      ? selectedInitial
      : indexGroups[0]?.initial || "A";
  });
  const activeGroup = indexGroups.find((group) => group.initial === activeInitial) || indexGroups[0];

  useEffect(() => {
    if (!litGenre) return;
    const nextInitial = getGenreInitial(litGenre.name);
    if (indexGroups.some((group) => group.initial === nextInitial)) {
      setActiveInitial(nextInitial);
    }
  }, [indexGroups, litGenre]);

  if (!genres.length) {
    return (
      <div className="mb-12">
        <EditorialEmpty title="No genres" detail="No genre or style terms were found in the collection." />
      </div>
    );
  }

  return (
    <section className="mb-16 md:mb-24" data-genre-atlas aria-labelledby="genre-atlas-title">
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="min-w-0">
          <SectionHeading
            title={<span id="genre-atlas-title">Most collected</span>}
            note={`Top ${topGenres.length}`}
            size="sm"
            className="mb-6"
          />
          <ol className="flex flex-col gap-1" data-ranked-overview>
            {topGenres.map((genre, index) => (
              <li key={genre.name}>
                <GenreRankRow
                  genre={genre}
                  index={index}
                  maxAlbums={maxAlbums}
                  flood={genreFlood(genre, colorMap)}
                  isSelected={litGenre?.name === genre.name}
                  onShowOnRecord={onShowOnRecord}
                />
              </li>
            ))}
          </ol>
        </div>

        <div className="flex min-w-0 flex-col rounded-3xl bg-[color:var(--ground-2)] p-5 md:p-6 xl:sticky xl:top-28 xl:max-h-[calc(100dvh-8rem)]" data-genre-index-panel>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="t-disp text-[26px] md:text-[32px]">A–Z</h2>
            <span className="t-mono text-[13px] text-[color:var(--cream-dim)]">{formatNumber(genres.length)}</span>
          </div>

          <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Jump to letter" data-genre-index-tabs>
            {indexGroups.map((group) => {
              const isActive = group.initial === activeGroup?.initial;
              return (
                <button
                  key={group.initial}
                  type="button"
                  onClick={() => setActiveInitial(group.initial)}
                  aria-pressed={isActive}
                  className={cn(
                    "t-mono inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-[13px] font-bold transition-colors",
                    isActive
                      ? "bg-[color:var(--cream)] text-[color:var(--ground)]"
                      : "text-[color:var(--cream-dim)] hover:bg-[color:var(--ground-3)] hover:text-[color:var(--cream)]",
                  )}
                >
                  {group.initial}
                </button>
              );
            })}
          </div>

          <div className="-mx-2 max-h-[420px] min-h-0 flex-1 overflow-y-auto px-2 xl:max-h-none" data-genre-index-scroll>
            {activeGroup && (
              <ol className="flex flex-col">
                {activeGroup.genres.map((genre) => {
                  const flood = genreFlood(genre, colorMap);
                  const isSelected = litGenre?.name === genre.name;
                  return (
                    <li
                      key={genre.name}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl pl-3",
                        isSelected && "bg-[color:var(--ground-3)]",
                      )}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: flood.flood }} aria-hidden />
                      <Link
                        to={`/genre/${slugify(genre.name)}`}
                        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 font-bold hover:underline"
                      >
                        <span className="truncate">{genre.name}</span>
                        <span className="t-mono ml-auto text-[12px] font-normal text-[color:var(--cream-dim)]">
                          {formatNumber(genre.albumCount)}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => onShowOnRecord(genre)}
                        aria-label={`Show ${genre.name} on the record`}
                        title="Show on the record"
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--cream-dim)] transition-colors hover:bg-[color:var(--ground)] hover:text-[color:var(--cream)]"
                      >
                        <VinylRecord className="h-4 w-4" weight="bold" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function GenreRankRow({
  genre,
  index,
  maxAlbums,
  flood,
  isSelected,
  onShowOnRecord,
}: {
  genre: GenreSummary;
  index: number;
  maxAlbums: number;
  flood: Flood;
  isSelected: boolean;
  onShowOnRecord: (genre: GenreSummary) => void;
}) {
  const dossierPath = `/genre/${slugify(genre.name)}`;
  const barWidth = `${Math.max(6, Math.round((genre.albumCount / maxAlbums) * 100))}%`;

  return (
    <div
      className={cn(
        "grid gap-4 rounded-2xl px-3 py-4 transition-colors md:grid-cols-[40px_minmax(0,1fr)_auto] md:items-center md:px-4",
        isSelected ? "bg-[color:var(--ground-2)]" : "hover:bg-[color:var(--ground-2)]",
      )}
    >
      <span className="t-mono hidden text-[13px] text-[color:var(--cream-dim)] md:block">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link to={dossierPath} className="t-disp break-words text-[26px] hover:underline md:text-[34px]">
            {genre.name}
          </Link>
          {isSelected && (
            <span className="t-mono text-[11px] uppercase text-[color:var(--cream-dim)]">On the record</span>
          )}
        </div>
        <p className="t-mono mt-2 text-[12px] uppercase text-[color:var(--cream-dim)]">
          {formatNumber(genre.albumCount)} records · {formatNumber(genre.artistCount)} artists · {formatYearSpan(genre.yearStart, genre.yearEnd)}
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-[color:var(--cream-rule)]">
          <div className="h-full rounded-full" style={{ width: barWidth, background: flood.flood }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        <CoverStrip genre={genre} />
        <button
          type="button"
          onClick={() => onShowOnRecord(genre)}
          aria-label={`Show ${genre.name} on the record`}
          className="pill pill-sm text-[color:var(--cream)]"
          style={{ borderColor: "var(--cream-rule)" }}
        >
          <VinylRecord className="h-4 w-4" weight="bold" aria-hidden />
          Show
        </button>
      </div>
    </div>
  );
}

function CoverStrip({ genre }: { genre: GenreSummary }) {
  const covers = genre.coverSamples.slice(0, 4);

  if (!covers.length) return null;

  return (
    <div className="flex -space-x-4" aria-hidden>
      {covers.map((album, i) => (
        <img
          key={album.slug}
          src={album.cover}
          alt=""
          loading="lazy"
          onError={handleImageError}
          className="h-12 w-12 bg-[color:var(--ground-3)] object-cover shadow-[0_8px_18px_-8px_rgba(0,0,0,.7)]"
          style={{ zIndex: covers.length - i }}
        />
      ))}
    </div>
  );
}

function groupGenreIndex(genres: GenreSummary[]): GenreIndexGroup[] {
  const groups = new Map<string, GenreSummary[]>();

  genres.forEach((genre) => {
    const initial = getGenreInitial(genre.name);
    const values = groups.get(initial) || [];
    values.push(genre);
    groups.set(initial, values);
  });

  return Array.from(groups.entries())
    .map(([initial, values]) => ({
      initial,
      genres: values.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.initial === "0-9") return 1;
      if (b.initial === "0-9") return -1;
      return a.initial.localeCompare(b.initial);
    });
}

function getGenreInitial(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return /^[0-9]$/.test(first) ? "0-9" : first || "#";
}

function formatYearSpan(start: number | null, end: number | null): string {
  if (start && end) return start === end ? String(start) : `${start}-${end}`;
  if (start) return `Since ${start}`;
  if (end) return `To ${end}`;
  return "Unknown";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
