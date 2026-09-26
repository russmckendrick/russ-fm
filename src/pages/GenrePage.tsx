import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Graph } from "@phosphor-icons/react";
import { BrowseHeader } from "@/components/browse/BrowseHeader";
import type { ColourMap } from "@/components/browse/facetSleeves";
import { genreFlood } from "@/components/genres/genreColours";
import { GenreExplorerPanel } from "@/components/genres/GenreExplorerPanel";
import { getGraphNodeCapacity } from "@/components/genres/useGenreGraphLayout";
import { EditorialEmpty, EditorialSkeleton, PageContainer } from "@/components/layout";
import { PillLink, SectionHeading } from "@/components/player";
import { appConfig } from "@/config/app.config";
import { useMetaTags } from "@/hooks/useMetaTags";
import { useAlbumColorMap } from "@/hooks/useAlbumColors";
import { usePageTitle } from "@/hooks/usePageTitle";
import { slugify } from "@/lib/browseFacets";
import { excludeBoxsetMembers } from "@/lib/boxsets";
import { loadCollection } from "@/lib/collection";
import { handleImageError } from "@/lib/image-utils";
import type { Flood } from "@/lib/sleeveColour";
import { cn } from "@/lib/utils";
import {
  ALL_GENRES_VALUE,
  getGenreExplorer,
  filterAlbums,
  filterArtists,
  filterGenres,
  normalizeSort,
  resolveArtist,
  resolveGenre,
  sortAlbums,
  sortArtists,
} from "@/lib/genreExplorer";
import type {
  GenreExplorerAlbum,
  GenreExplorerArtist,
  GenreSummary,
} from "@/lib/genreExplorer";
import type { Album } from "@/types/album";

const NODE_PRESETS = {
  standard: 14,
  more: 22,
  max: 32,
} as const;

const NODE_BUDGET_MIN = 1;

interface GenreIndexGroup {
  initial: string;
  genres: GenreSummary[];
}

export function GenrePage() {
  const [collection, setCollection] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewportNodeDefault, setViewportNodeDefault] = useState(() => getResponsiveNodeDefault(getViewportWidth()));
  const colorMap = useAlbumColorMap();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("q") || "";
  const genreParam = searchParams.get("genre");
  const artistParam = searchParams.get("artist");
  const albumParam = searchParams.get("album");
  const nodesParam = searchParams.get("nodes");
  const sort = normalizeSort(searchParams.get("sort"));
  const requestedNodeBudget = normalizeNodeBudget(nodesParam, viewportNodeDefault);

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

  useEffect(() => {
    const updateViewportDefault = () => {
      setViewportNodeDefault(getResponsiveNodeDefault(getViewportWidth()));
    };

    updateViewportDefault();
    window.addEventListener("resize", updateViewportDefault);

    return () => window.removeEventListener("resize", updateViewportDefault);
  }, []);

  const explorer = useMemo(() => getGenreExplorer(collection), [collection]);
  const selectedGenre = useMemo(
    () => resolveGenre(explorer.genres, genreParam, explorer.allGenre),
    [explorer.allGenre, explorer.genres, genreParam],
  );
  const selectedArtist = useMemo(
    () => {
      if (!artistParam) return null;
      return resolveArtist(explorer.allGenre, artistParam) || resolveArtist(selectedGenre, artistParam);
    },
    [artistParam, explorer.allGenre, selectedGenre],
  );
  const artists = useMemo(() => {
    if (!selectedGenre) return [];
    return sortArtists(filterArtists(selectedGenre.artists, query), sort);
  }, [query, selectedGenre, sort]);
  const albums = useMemo(() => {
    const source = selectedArtist?.albums || selectedGenre?.albums || [];
    return sortAlbums(filterAlbums(source, query), sort);
  }, [query, selectedArtist, selectedGenre, sort]);
  const selectedAlbum = useMemo(
    () => albums.find((album) => album.slug === albumParam) || null,
    [albumParam, albums],
  );
  const graphGenre = useMemo(() => {
    if (!selectedGenre) return null;
    if (!selectedGenre.isAll || !query) return selectedGenre;

    const relatedGenres = filterGenres(explorer.genres, query)
      .map((genre) => ({ name: genre.name, albumCount: genre.albumCount }));

    return relatedGenres.length ? { ...selectedGenre, relatedGenres } : selectedGenre;
  }, [explorer.genres, query, selectedGenre]);
  const nodeCapacity = useMemo(
    () => getGraphNodeCapacity(graphGenre, artists, selectedArtist, albums, explorer.genres),
    [albums, artists, explorer.genres, graphGenre, selectedArtist],
  );
  const nodeBudget = useMemo(
    () => clampNodeBudget(requestedNodeBudget, nodeCapacity),
    [nodeCapacity, requestedNodeBudget],
  );

  usePageTitle(
    selectedGenre && !selectedGenre.isAll
      ? `${selectedGenre.name} genre map | Genres | Russ.fm`
      : "Genres | Russ.fm",
  );
  useMetaTags({
    title: "Genres | Russ.fm",
    description: "Browse the russ.fm collection by genre and style, with ranked counts, genre dossiers, and an interactive map.",
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

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const selectGenre = useCallback(
    (genre: GenreSummary) => {
      updateParams({
        genre: genre.isAll ? ALL_GENRES_VALUE : genre.name,
        artist: null,
        album: null,
      });
    },
    [updateParams],
  );

  const focusGenreFromAtlas = useCallback(
    (genre: GenreSummary) => {
      const params = new URLSearchParams(searchParams);
      params.set("genre", genre.name);
      params.delete("artist");
      params.delete("album");

      navigate({
        pathname: "/genres",
        search: `?${params.toString()}`,
        hash: "#genre-map",
      });

      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          document.getElementById("genre-map")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 0);
      }
    },
    [navigate, searchParams],
  );

  const selectArtist = useCallback(
    (artist: GenreExplorerArtist) => {
      updateParams({
        genre: selectedGenre?.isAll ? ALL_GENRES_VALUE : selectedGenre?.name || null,
        artist: artist.slug,
        album: null,
      });
    },
    [selectedGenre, updateParams],
  );

  const openAlbum = useCallback(
    (album: GenreExplorerAlbum) => {
      navigate(album.uri);
    },
    [navigate],
  );
  const clearArtistFocus = useCallback(
    () => updateParams({ artist: null, album: null }),
    [updateParams],
  );
  const goBack = useCallback(() => navigate(-1), [navigate]);
  const goForward = useCallback(() => navigate(1), [navigate]);

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

  if (!selectedGenre || !graphGenre) {
    return (
      <PageContainer>
        <EditorialEmpty title="No genre data" detail="The collection did not include usable genre metadata." />
      </PageContainer>
    );
  }

  const focusedDossierPath = selectedGenre.isAll ? null : `/genre/${slugify(selectedGenre.name)}`;
  const selectedFlood = genreFlood(selectedGenre, colorMap);

  return (
    <PageContainer className="pb-16">
      <BrowseHeader
        title="Genres"
        note={`${formatNumber(explorer.genres.length)} · ${formatNumber(explorer.totalAlbums)} records · ${formatNumber(explorer.totalArtists)} artists · ${formatYearSpan(explorer.yearStart, explorer.yearEnd)}`}
        current="genres"
      />

      {focusedDossierPath && (
        <div className="mb-10 flex flex-wrap items-center gap-3">
          <span
            className="chip min-h-[44px] px-4 text-[15px]"
            style={{ background: selectedFlood.flood, color: selectedFlood.ink }}
          >
            <span className="t-mono text-[11px] font-normal uppercase" style={{ color: selectedFlood.sub }}>
              On the map
            </span>
            {selectedGenre.name}
          </span>
          <PillLink to={focusedDossierPath} size="sm" className="text-[color:var(--cream)]">
            {selectedGenre.name} records
          </PillLink>
        </div>
      )}

      <GenreAtlas
        genres={explorer.genres}
        selectedGenre={selectedGenre}
        colorMap={colorMap}
        onFocusGenre={focusGenreFromAtlas}
      />

      <GenreExplorerPanel
        explorer={explorer}
        selectedGenre={selectedGenre}
        graphGenre={graphGenre}
        artists={artists}
        albums={albums}
        selectedArtist={selectedArtist}
        selectedAlbum={selectedAlbum}
        query={query}
        sort={sort}
        nodeBudget={nodeBudget}
        nodeCapacity={nodeCapacity}
        isAutoNodeBudget={!nodesParam}
        colorMap={colorMap}
        onQueryChange={(value) => updateParams({ q: value || null })}
        onSortChange={(value) => updateParams({ sort: value })}
        onNodeBudgetChange={(value) => updateParams({ nodes: value == null ? null : String(value) })}
        onGenreChange={selectGenre}
        onSelectArtist={selectArtist}
        onOpenAlbum={openAlbum}
        onBack={goBack}
        onForward={goForward}
        onClearArtistFocus={clearArtistFocus}
      />
    </PageContainer>
  );
}

function GenreAtlas({
  genres,
  selectedGenre,
  colorMap,
  onFocusGenre,
}: {
  genres: GenreSummary[];
  selectedGenre: GenreSummary;
  colorMap: ColourMap;
  onFocusGenre: (genre: GenreSummary) => void;
}) {
  const topGenres = genres.slice(0, 12);
  const maxAlbums = topGenres[0]?.albumCount || 1;
  const indexGroups = useMemo(() => groupGenreIndex(genres), [genres]);
  const selectedInitial = selectedGenre.isAll ? indexGroups[0]?.initial : getGenreInitial(selectedGenre.name);
  const [activeInitial, setActiveInitial] = useState(() => {
    return indexGroups.some((group) => group.initial === selectedInitial)
      ? selectedInitial
      : indexGroups[0]?.initial || "A";
  });
  const activeGroup = indexGroups.find((group) => group.initial === activeInitial) || indexGroups[0];

  useEffect(() => {
    if (selectedGenre.isAll) return;
    const nextInitial = getGenreInitial(selectedGenre.name);
    if (indexGroups.some((group) => group.initial === nextInitial)) {
      setActiveInitial(nextInitial);
    }
  }, [indexGroups, selectedGenre.isAll, selectedGenre.name]);

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
                  isSelected={selectedGenre.name === genre.name}
                  onFocusGenre={onFocusGenre}
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
                  const isSelected = selectedGenre.name === genre.name;
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
                        onClick={() => onFocusGenre(genre)}
                        aria-label={`Show ${genre.name} on the map`}
                        title="Show on the map"
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--cream-dim)] transition-colors hover:bg-[color:var(--ground)] hover:text-[color:var(--cream)]"
                      >
                        <Graph className="h-4 w-4" weight="bold" aria-hidden />
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
  onFocusGenre,
}: {
  genre: GenreSummary;
  index: number;
  maxAlbums: number;
  flood: Flood;
  isSelected: boolean;
  onFocusGenre: (genre: GenreSummary) => void;
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
            <span className="t-mono text-[11px] uppercase text-[color:var(--cream-dim)]">On the map</span>
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
          onClick={() => onFocusGenre(genre)}
          aria-label={`Show ${genre.name} on the map`}
          className="pill pill-sm text-[color:var(--cream)]"
          style={{ borderColor: "var(--cream-rule)" }}
        >
          <Graph className="h-4 w-4" weight="bold" aria-hidden />
          Map
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

function getResponsiveNodeDefault(width: number): number {
  if (width < 768) return NODE_PRESETS.standard;
  if (width < 1180) return NODE_PRESETS.more;
  return NODE_PRESETS.max;
}

function getViewportWidth(): number {
  if (typeof window === "undefined") return 1280;
  return window.innerWidth || 1280;
}

function normalizeNodeBudget(value: string | null, viewportDefault: number): number {
  if (value === "standard") return NODE_PRESETS.standard;
  if (value === "more") return NODE_PRESETS.more;
  if (value === "max") return NODE_PRESETS.max;

  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);

  return viewportDefault;
}

function clampNodeBudget(value: number, max: number): number {
  const upper = Math.max(NODE_BUDGET_MIN, max);
  return Math.min(Math.max(NODE_BUDGET_MIN, Math.round(value)), upper);
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
