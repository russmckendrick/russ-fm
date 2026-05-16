import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { BrowseHeader } from "@/components/browse/BrowseHeader";
import { GenreExplorerPanel } from "@/components/genres/GenreExplorerPanel";
import { getGraphNodeCapacity } from "@/components/genres/useGenreGraphLayout";
import { EditorialEmpty, EditorialSkeleton, PageContainer } from "@/components/layout";
import { appConfig } from "@/config/app.config";
import { useMetaTags } from "@/hooks/useMetaTags";
import { usePageTitle } from "@/hooks/usePageTitle";
import { slugify } from "@/lib/browseFacets";
import {
  ALL_GENRES_VALUE,
  buildGenreExplorer,
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
        const response = await fetch("/collection.json");
        if (!response.ok) throw new Error("Failed to load collection data");
        const data = await response.json();
        setCollection(Array.isArray(data) ? data : []);
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

  const explorer = useMemo(() => buildGenreExplorer(collection), [collection]);
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
        <EditorialSkeleton label="Loading genre atlas..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <EditorialEmpty title="Genres failed" detail={error} />
      </PageContainer>
    );
  }

  if (!selectedGenre || !graphGenre) {
    return (
      <PageContainer>
        <EditorialEmpty title="No genre data available" detail="The collection did not include usable genre metadata." />
      </PageContainer>
    );
  }

  const focusedDossierPath = selectedGenre.isAll ? null : `/genre/${slugify(selectedGenre.name)}`;

  return (
    <PageContainer className="pb-12">
      <BrowseHeader
        num="00"
        kicker="Browse · russ.fm / genres"
        title="Browse by genre"
        subtitle="A ranked atlas of every genre and style in the collection, paired with the interactive map for following how records, artists, and scenes connect."
        counts={[
          { label: "Albums", value: formatNumber(explorer.totalAlbums) },
          { label: "Artists", value: formatNumber(explorer.totalArtists) },
          { label: "Terms", value: formatNumber(explorer.genres.length) },
          { label: "Years", value: formatYearSpan(explorer.yearStart, explorer.yearEnd) },
        ]}
      />

      {focusedDossierPath && (
        <div className="mb-8 flex flex-col gap-3 border-y border-rule bg-paper px-4 py-3 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
            Map focus: <span className="text-ink">{selectedGenre.name}</span>
          </p>
          <Link
            to={focusedDossierPath}
            className="inline-flex w-fit items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-colors hover:text-hl"
          >
            View genre dossier
            <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
          </Link>
        </div>
      )}

      <GenreAtlas
        genres={explorer.genres}
        selectedGenre={selectedGenre}
        totalAlbums={explorer.totalAlbums}
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
  totalAlbums,
  onFocusGenre,
}: {
  genres: GenreSummary[];
  selectedGenre: GenreSummary;
  totalAlbums: number;
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
    <section className="mb-12" data-genre-atlas>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
            01 · Genre atlas
          </p>
          <h2 className="font-display text-[clamp(34px,5vw,64px)] uppercase leading-none text-ink">
            Ranked overview
          </h2>
        </div>
        <p className="max-w-xl font-grot text-[14px] leading-[1.6] text-ink-2 md:text-right">
          {formatNumber(genres.length)} genre and style terms across {formatNumber(totalAlbums)} records, ranked by shelf weight.
        </p>
      </div>

      <div className="grid items-stretch gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <ol className="divide-y divide-rule border-y border-rule" data-ranked-overview>
          {topGenres.map((genre, index) => (
            <li
              key={genre.name}
              className={selectedGenre.name === genre.name ? "bg-paper-2" : undefined}
            >
              <GenreRankRow
                genre={genre}
                index={index}
                maxAlbums={maxAlbums}
                isSelected={selectedGenre.name === genre.name}
                onFocusGenre={onFocusGenre}
              />
            </li>
          ))}
        </ol>

        <div className="flex min-h-[420px] flex-col border-y border-rule xl:h-full" data-genre-index-panel>
          <div className="flex items-baseline justify-between gap-3 border-b border-rule py-3">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              A-Z index
            </h3>
            <span className="font-mono text-[11px] tabular-nums text-ink-dim">
              {formatNumber(genres.length)}
            </span>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-rule py-3" data-genre-index-tabs>
            {indexGroups.map((group) => {
              const isActive = group.initial === activeGroup?.initial;
              return (
                <button
                  key={group.initial}
                  type="button"
                  onClick={() => setActiveInitial(group.initial)}
                  aria-pressed={isActive}
                  className={`min-w-8 border px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors active:translate-y-px ${
                    isActive
                      ? "border-ink bg-ink text-paper"
                      : "border-rule text-ink-3 hover:border-hl hover:text-hl"
                  }`}
                >
                  {group.initial}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-genre-index-scroll>
            {activeGroup && (
              <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-4 py-4">
                <div>
                  <h4 className="font-display text-[36px] uppercase leading-none text-ink">{activeGroup.initial}</h4>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
                    {formatNumber(activeGroup.genres.length)}
                  </p>
                </div>
                <ol className="space-y-1">
                  {activeGroup.genres.map((genre) => (
                    <li
                      key={genre.name}
                      className={selectedGenre.name === genre.name ? "bg-paper-2" : undefined}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_52px_44px] items-center gap-2 py-1">
                        <Link
                          to={`/genre/${slugify(genre.name)}`}
                          className="truncate font-grot text-[13px] text-ink transition-colors hover:text-hl"
                        >
                          {genre.name}
                        </Link>
                        <span className="text-right font-mono text-[10.5px] tabular-nums text-ink-dim">
                          {formatNumber(genre.albumCount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onFocusGenre(genre)}
                          className="justify-self-end border border-rule px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:border-hl hover:text-hl active:translate-y-px"
                        >
                          Map
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
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
  isSelected,
  onFocusGenre,
}: {
  genre: GenreSummary;
  index: number;
  maxAlbums: number;
  isSelected: boolean;
  onFocusGenre: (genre: GenreSummary) => void;
}) {
  const dossierPath = `/genre/${slugify(genre.name)}`;
  const barWidth = `${Math.max(6, Math.round((genre.albumCount / maxAlbums) * 100))}%`;

  return (
    <div className="grid gap-4 py-4 md:grid-cols-[36px_minmax(0,1fr)_168px_auto] md:items-center">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link
            to={dossierPath}
            className="font-display text-[clamp(24px,3vw,36px)] uppercase leading-none text-ink transition-colors hover:text-hl"
          >
            {genre.name}
          </Link>
          {isSelected && (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-hl">
              Map focus
            </span>
          )}
        </div>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
          {formatNumber(genre.albumCount)} albums · {formatNumber(genre.artistCount)} artists · {formatYearSpan(genre.yearStart, genre.yearEnd)}
        </p>
        <div className="mt-3 h-1.5 bg-rule">
          <div className="h-full bg-ink" style={{ width: barWidth }} />
        </div>
      </div>

      <CoverStrip genre={genre} />

      <div className="flex flex-wrap gap-2 md:justify-end">
        <Link
          to={dossierPath}
          className="inline-flex items-center gap-2 border border-rule px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:border-hl hover:text-hl active:translate-y-px"
        >
          Dossier
          <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
        </Link>
        <button
          type="button"
          onClick={() => onFocusGenre(genre)}
          className="border border-rule px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:border-hl hover:text-hl active:translate-y-px"
        >
          Map
        </button>
      </div>
    </div>
  );
}

function CoverStrip({ genre }: { genre: GenreSummary }) {
  const covers = genre.coverSamples.slice(0, 4);

  if (!covers.length) {
    return <div className="hidden h-12 bg-rule md:block" />;
  }

  return (
    <div className="flex -space-x-3 overflow-hidden md:justify-end">
      {covers.map((album) => (
        <img
          key={album.slug}
          src={album.cover}
          alt={`${album.title} cover`}
          loading="lazy"
          className="h-12 w-12 border border-paper bg-paper object-cover shadow-[0_10px_20px_-14px_rgba(14,13,11,0.5)]"
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
