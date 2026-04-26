import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowSquareOut, MagnifyingGlass, SlidersHorizontal, SortAscending, X } from "@phosphor-icons/react";
import { GenreGraph } from "@/components/genres/GenreGraph";
import { getGraphNodeCapacity } from "@/components/genres/useGenreGraphLayout";
import { EditorialEmpty, EditorialSkeleton, PageContainer } from "@/components/layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageTitle } from "@/hooks/usePageTitle";
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
  GenreExplorerSort,
  GenreSummary,
} from "@/lib/genreExplorer";
import type { Album } from "@/types/album";

const SORT_OPTIONS: Array<{ value: GenreExplorerSort; label: string }> = [
  { value: "dominance", label: "Most collected" },
  { value: "recent", label: "Recently added" },
  { value: "name", label: "Name" },
  { value: "year", label: "Release year" },
];

const NODE_PRESETS = {
  standard: 14,
  more: 22,
  max: 32,
} as const;

const NODE_BUDGET_MIN = 1;

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
    selectedGenre
      ? `${selectedGenre.name}${selectedArtist ? ` / ${selectedArtist.name}` : ""} | Genres | Russ.fm`
      : "Genres | Russ.fm",
  );

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
        <EditorialSkeleton label="Loading genre map..." />
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

  return (
    <PageContainer className="pb-10">
      <section className="overflow-hidden border border-rule-strong bg-paper">
        <div className="grid gap-3 border-b border-rule-strong bg-paper px-4 py-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(190px,1fr)_145px_250px_auto] lg:items-center lg:divide-x lg:divide-rule-strong lg:px-0">
          <div className="min-w-0 lg:px-4">
            <GenreSelect
              allGenre={explorer.allGenre}
              genres={explorer.genres}
              value={selectedGenre.isAll ? ALL_GENRES_VALUE : selectedGenre.name}
              onChange={(value) => {
                const nextGenre =
                  value === ALL_GENRES_VALUE
                    ? explorer.allGenre
                    : explorer.genres.find((candidate) => candidate.name === value);
                if (nextGenre) selectGenre(nextGenre);
              }}
            />
          </div>
          <SearchControl value={query} onChange={(value) => updateParams({ q: value || null })} />
          <SortControl value={sort} onChange={(value) => updateParams({ sort: value })} />
          <NodeBudgetControl
            value={nodeBudget}
            max={nodeCapacity}
            isAuto={!nodesParam}
            onChange={(value) => updateParams({ nodes: value == null ? null : String(value) })}
          />
          <SelectionActions artist={selectedArtist} album={selectedAlbum} onClear={(key) => updateParams({ [key]: null })} />
        </div>

        <GenreGraph
          genre={graphGenre}
          artists={artists}
          albums={albums}
          selectedArtist={selectedArtist}
          selectedAlbum={selectedAlbum}
          nodeBudget={nodeBudget}
          allGenres={explorer.genres}
          onSelectGenre={selectGenre}
          onSelectArtist={selectArtist}
          onOpenAlbum={openAlbum}
          onBack={goBack}
          onForward={goForward}
          onClearArtistFocus={clearArtistFocus}
        />
      </section>
    </PageContainer>
  );
}

function GenreSelect({
  allGenre,
  genres,
  value,
  onChange,
}: {
  allGenre: GenreSummary;
  genres: GenreSummary[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative block">
      <span className="sr-only">Choose genre</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label="Choose genre"
          className="h-14 gap-3 rounded-none border-0 bg-transparent px-0 py-1 font-display text-[28px] uppercase leading-none text-ink shadow-none ring-offset-0 transition-colors hover:text-hl focus:ring-0 focus:ring-offset-0 data-[state=open]:text-hl md:text-[32px] [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 [&>svg]:opacity-100"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          sideOffset={8}
          className="max-h-[min(72vh,560px)] min-w-[min(560px,calc(100vw-40px))] rounded-none border border-rule-strong bg-paper p-0 font-grot text-ink shadow-[0_28px_70px_-36px_rgba(14,13,11,0.45)]"
        >
          <SelectItem
            value={ALL_GENRES_VALUE}
            className="rounded-none border-b border-rule bg-paper py-3 pl-9 pr-4 font-display text-[21px] uppercase leading-none text-ink data-[state=checked]:text-hl focus:bg-paper-2 focus:text-hl"
          >
            <span className="flex w-full items-center justify-between gap-6">
              <span>All genres</span>
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-dim">
                {formatNumber(allGenre.albumCount)}
              </span>
            </span>
          </SelectItem>
          {genres.map((genre) => (
            <SelectItem
              key={genre.name}
              value={genre.name}
              className="rounded-none py-2.5 pl-9 pr-4 font-grot text-[14px] font-semibold text-ink data-[state=checked]:text-hl focus:bg-paper-2 focus:text-hl"
            >
              <span className="flex w-full items-center justify-between gap-6">
                <span className="truncate">{genre.name}</span>
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-dim">
                  {formatNumber(genre.albumCount)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SearchControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 lg:px-4">
      <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        <MagnifyingGlass className="h-4 w-4" weight="bold" />
        Search
      </span>
      <span className="flex h-9 items-center gap-2">
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Genre, artist, record"
          className="h-full min-w-0 flex-1 bg-transparent font-grot text-[14px] text-ink outline-none placeholder:text-ink-dim"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="text-ink-dim transition-colors hover:text-hl"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        )}
      </span>
    </label>
  );
}

function SortControl({
  value,
  onChange,
}: {
  value: GenreExplorerSort;
  onChange: (value: GenreExplorerSort) => void;
}) {
  return (
    <label className="flex flex-col gap-2 lg:px-4">
      <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        <SortAscending className="h-4 w-4" weight="bold" />
        Sort
      </span>
      <Select
        value={value}
        onValueChange={(nextValue) => onChange(normalizeSort(nextValue))}
      >
        <SelectTrigger className="h-8 gap-2 rounded-none border-0 bg-transparent px-0 py-0 font-grot text-[13px] font-medium text-ink shadow-none ring-offset-0 focus:ring-0 focus:ring-offset-0 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:opacity-100">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          sideOffset={8}
          className="max-h-[320px] rounded-none border border-rule-strong bg-paper font-grot text-ink"
        >
          {SORT_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="rounded-none py-2 pl-8 pr-3 text-[13px] data-[state=checked]:text-hl focus:bg-paper-2 focus:text-hl"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function NodeBudgetControl({
  value,
  max,
  isAuto,
  onChange,
}: {
  value: number;
  max: number;
  isAuto: boolean;
  onChange: (value: number | null) => void;
}) {
  const sliderMax = Math.max(NODE_BUDGET_MIN, max);
  const sliderValue = Math.min(value, sliderMax);
  const disabled = sliderMax <= NODE_BUDGET_MIN;

  return (
    <div className="flex flex-col gap-2 lg:px-4">
      <div className="flex items-center justify-between gap-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" weight="bold" />
          Nodes
        </span>
        <span className="whitespace-nowrap tabular-nums text-ink-3">
          {isAuto ? `Auto ${formatNumber(sliderValue)}` : formatNumber(sliderValue)} / {formatNumber(max)}
        </span>
      </div>
      <div className="flex h-8 items-center gap-3">
        <input
          type="range"
          min={NODE_BUDGET_MIN}
          max={sliderMax}
          step={1}
          value={sliderValue}
          disabled={disabled}
          aria-label="Visible graph node count"
          onInput={(event) => onChange(Number(event.currentTarget.value))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none bg-rule accent-ink disabled:cursor-default disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={isAuto}
          className="border border-rule px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:border-hl hover:text-hl disabled:pointer-events-none disabled:opacity-35"
        >
          Auto
        </button>
      </div>
    </div>
  );
}

function SelectionActions({
  artist,
  album,
  onClear,
}: {
  artist: GenreExplorerArtist | null;
  album: GenreExplorerAlbum | null;
  onClear: (key: "artist" | "album") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 lg:px-4">
      {artist && (
        <>
          <button
            type="button"
            onClick={() => onClear("artist")}
            className="inline-flex items-center gap-2 border border-rule px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:border-hl hover:text-hl"
          >
            <X className="h-3.5 w-3.5" weight="bold" />
            {artist.name}
          </button>
          <Link
            to={`/artist/${artist.slug}`}
            className="inline-flex items-center gap-2 border border-rule px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:border-hl hover:text-hl"
          >
            Artist page
            <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
          </Link>
        </>
      )}
      {album && (
        <Link
          to={album.uri}
          className="inline-flex items-center gap-2 border border-rule px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:border-hl hover:text-hl"
        >
          Record page
          <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
        </Link>
      )}
    </div>
  );
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
