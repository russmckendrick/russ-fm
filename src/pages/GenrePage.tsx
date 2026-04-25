import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import * as d3 from "d3";
import { ArrowSquareOut, MagnifyingGlass, SlidersHorizontal, SortAscending, X } from "@phosphor-icons/react";
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

type GraphNodeType = "genre" | "related" | "artist" | "album";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: GraphNodeType;
  name: string;
  count: number;
  slug?: string;
  image?: string;
  genre?: GenreSummary;
  artist?: GenreExplorerArtist;
  album?: GenreExplorerAlbum;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: "related" | "artist" | "album";
}

const SORT_OPTIONS: Array<{ value: GenreExplorerSort; label: string }> = [
  { value: "dominance", label: "Most collected" },
  { value: "recent", label: "Recently added" },
  { value: "name", label: "Name" },
  { value: "year", label: "Release year" },
];

const NODE_PRESETS = {
  standard: 30,
  more: 52,
  max: 84,
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
    () => resolveArtist(selectedGenre, artistParam),
    [artistParam, selectedGenre],
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
        <div className="grid gap-3 border-b border-rule-strong bg-paper px-4 py-3 lg:grid-cols-[minmax(180px,0.72fr)_minmax(250px,1fr)_190px_250px_auto] lg:items-center lg:divide-x lg:divide-rule-strong lg:px-0">
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

        <D3Explorer
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
          className="h-14 gap-3 rounded-none border-0 bg-transparent px-0 py-1 font-display text-[28px] uppercase leading-none text-ink shadow-none ring-offset-0 transition-colors hover:text-hl focus:ring-0 focus:ring-offset-0 data-[state=open]:text-hl md:text-[34px] [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0 [&>svg]:opacity-100"
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
        <span className="tabular-nums text-ink-3">
          {isAuto ? "Auto" : formatNumber(sliderValue)} / {formatNumber(max)}
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

function D3Explorer({
  genre,
  artists,
  albums,
  selectedArtist,
  selectedAlbum,
  nodeBudget,
  allGenres,
  onSelectGenre,
  onSelectArtist,
  onOpenAlbum,
}: {
  genre: GenreSummary;
  artists: GenreExplorerArtist[];
  albums: GenreExplorerAlbum[];
  selectedArtist: GenreExplorerArtist | null;
  selectedAlbum: GenreExplorerAlbum | null;
  nodeBudget: number;
  allGenres: GenreSummary[];
  onSelectGenre: (genre: GenreSummary) => void;
  onSelectArtist: (artist: GenreExplorerArtist) => void;
  onOpenAlbum: (album: GenreExplorerAlbum) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode) return;

    const svg = d3.select(svgNode);
    const tip = d3.select(tipRef.current);
    let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
    let renderFrame = 0;

    const render = () => {
      const bounds = svgNode.getBoundingClientRect();
      const width = Math.max(760, Math.round(bounds.width || svgNode.clientWidth || 1180));
      const height = Math.max(620, Math.round(bounds.height || svgNode.clientHeight || 700));
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      simulation?.stop();
      svg.selectAll("*").remove();
      svg.on(".zoom", null);

      svg
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const centerX = width * 0.48;
      const centerY = height * 0.5;
      const relatedCandidates = getRelatedGenreSummaries(genre, allGenres);
      const artistCandidates = selectedArtist
        ? [selectedArtist, ...artists.filter((artist) => artist.slug !== selectedArtist.slug)]
        : artists;
      const albumCandidates = selectedArtist ? albums : [];
      const sliceCounts = distributeNodeBudget(
        nodeBudget,
        {
          related: relatedCandidates.length,
          artists: artistCandidates.length,
          albums: albumCandidates.length,
        },
        Boolean(selectedArtist),
      );
      const shownRelated = relatedCandidates.slice(0, sliceCounts.related);
      const shownArtists = artistCandidates.slice(0, sliceCounts.artists);
      const shownAlbums = albumCandidates.slice(0, sliceCounts.albums);

      const nodes: GraphNode[] = [
        {
          id: `genre-${genre.name}`,
          type: "genre",
          name: genre.name,
          count: genre.albumCount,
          genre,
          fx: centerX,
          fy: centerY,
        },
        ...shownRelated.map((related) => ({
          id: `related-${related.name}`,
          type: "related" as const,
          name: related.name,
          count: related.albumCount,
          genre: related,
        })),
        ...shownArtists.map((artist) => ({
          id: `artist-${artist.slug}`,
          type: "artist" as const,
          name: artist.name,
          count: artist.albumCount,
          slug: artist.slug,
          image: artist.avatar,
          artist,
        })),
        ...shownAlbums.map((album) => ({
          id: `album-${album.slug}`,
          type: "album" as const,
          name: album.title,
          count: 1,
          slug: album.slug,
          image: album.cover,
          album,
        })),
      ];

      nodes.forEach((node, index) => {
        if (node.type === "genre") return;

        const typeIndex = nodes.filter((candidate) => candidate.type === node.type).findIndex((candidate) => candidate.id === node.id);
        const typeCount = nodes.filter((candidate) => candidate.type === node.type).length;

        if (node.type === "related") {
          node.x = width * 0.2;
          node.y = distributeY(typeIndex, typeCount, height, 104);
        }

        if (node.type === "artist") {
          const selectedOffset = selectedArtist?.slug === node.slug ? 0 : index % 2 ? -28 : 28;
          node.x = width * 0.5 + selectedOffset;
          node.y = distributeY(typeIndex, typeCount, height, 92);
        }

        if (node.type === "album") {
          const columns = selectedArtist ? 3 : 2;
          const col = typeIndex % columns;
          const row = Math.floor(typeIndex / columns);
          const rows = Math.ceil(typeCount / columns);
          node.x = width * (selectedArtist ? 0.68 : 0.72) + col * Math.min(104, width * 0.075);
          node.y = distributeY(row, rows, height, 96);
        }
      });

      const links: GraphLink[] = [
        ...shownRelated.map((related) => ({
          source: `genre-${genre.name}`,
          target: `related-${related.name}`,
          kind: "related" as const,
        })),
        ...shownArtists.map((artist) => ({
          source: `genre-${genre.name}`,
          target: `artist-${artist.slug}`,
          kind: "artist" as const,
        })),
        ...shownAlbums.map((album) => {
          const owner =
            selectedArtist ||
            shownArtists.find((artist) => artist.name.toLowerCase() === album.artist.toLowerCase()) ||
            shownArtists[0];
          return {
            source: owner ? `artist-${owner.slug}` : `genre-${genre.name}`,
            target: `album-${album.slug}`,
            kind: "album" as const,
          };
        }),
      ];

      const defs = svg.append("defs");
      nodes
        .filter((node) => node.image)
        .forEach((node) => {
          const clip = defs.append("clipPath").attr("id", `genre-clip-${safeId(node.id)}`);
          if (node.type === "album") {
            clip.append("rect").attr("x", -26).attr("y", -26).attr("width", 52).attr("height", 52);
          } else {
            clip.append("circle").attr("cx", 0).attr("cy", 0).attr("r", nodeRadius(node));
          }
        });

      const graph = svg.append("g").attr("class", "genre-graph");

      svg.call(
        d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.76, 2.2])
          .translateExtent([
            [-width * 0.2, -height * 0.2],
            [width * 1.2, height * 1.2],
          ])
          .on("zoom", (event) => {
            graph.attr("transform", event.transform.toString());
          }),
      );
      svg.on("dblclick.zoom", null);

      graph
        .append("line")
        .attr("x1", width * 0.28)
        .attr("x2", width * 0.7)
        .attr("y1", centerY)
        .attr("y2", centerY)
        .attr("stroke", "var(--rule)")
        .attr("stroke-dasharray", "2 10")
        .attr("stroke-linecap", "round")
        .attr("opacity", 0.48);

      const link = graph
        .append("g")
        .attr("stroke", "var(--rule-strong)")
        .attr("stroke-opacity", 0.42)
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke-width", (item) => {
          if (item.kind === "album") return 0.9;
          if (item.kind === "artist") return 1.2;
          return 0.8;
        })
        .attr("stroke-dasharray", (item) => (item.kind === "related" ? "3 7" : null));

      const node = graph
        .append("g")
        .selectAll<SVGGElement, GraphNode>("g")
        .data(nodes)
        .join("g")
        .attr("data-node-type", (item) => item.type)
        .attr("data-node-slug", (item) => item.slug || null)
        .attr("tabindex", (item) => (item.type === "genre" ? null : 0))
        .attr("role", (item) => (item.type === "genre" ? null : "button"))
        .attr("aria-label", (item) => {
          if (item.type === "album") return `Open album ${item.name}`;
          return `${item.type} ${item.name}`;
        })
        .style("cursor", (item) => (item.type === "genre" ? "default" : "pointer"))
        .on("click", (_, item) => {
          if (item.album) {
            onOpenAlbum(item.album);
            return;
          }
          if (item.type === "related" && item.genre) onSelectGenre(item.genre);
          if (item.artist) onSelectArtist(item.artist);
        })
        .on("keydown", (event: KeyboardEvent, item) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (item.album) {
            onOpenAlbum(item.album);
            return;
          }
          if (item.type === "related" && item.genre) onSelectGenre(item.genre);
          if (item.artist) onSelectArtist(item.artist);
        })
        .on("mouseenter", (event, item) => {
          const label =
            item.type === "album"
              ? `${item.name} / ${item.album?.artist || "Unknown"}`
              : `${item.name}${item.count ? ` / ${formatNumber(item.count)}` : ""}`;
          tip
            .style("opacity", "1")
            .style("transform", `translate(${event.offsetX + 14}px, ${event.offsetY + 14}px)`)
            .text(label);
        })
        .on("mousemove", (event) => {
          tip.style("transform", `translate(${event.offsetX + 14}px, ${event.offsetY + 14}px)`);
        })
        .on("mouseleave", () => {
          tip.style("opacity", "0");
        });

      const roundNode = node.filter((item) => item.type !== "album");
      const albumNode = node.filter((item) => item.type === "album");
      const centerNode = roundNode.filter((item) => item.type === "genre");
      const orbitNode = roundNode.filter((item) => item.type !== "genre");

      orbitNode
        .append("circle")
        .attr("r", nodeRadius)
        .attr("fill", (item) => {
          if (item.type === "related") return "var(--paper)";
          if (selectedArtist?.slug === item.slug) return "var(--hl)";
          return "var(--paper)";
        })
        .attr("stroke", (item) => {
          if (selectedArtist?.slug === item.slug) return "var(--hl)";
          return item.type === "related" ? "var(--ink-dim)" : "var(--rule-strong)";
        })
        .attr("stroke-width", 1);

      centerNode
        .append("circle")
        .attr("r", nodeRadius)
        .attr("fill", "var(--paper)")
        .attr("stroke", "var(--rule-strong)")
        .attr("stroke-width", 1.2);

      centerNode
        .append("circle")
        .attr("r", 29)
        .attr("fill", "none")
        .attr("stroke", "var(--rule)")
        .attr("stroke-width", 1);

      centerNode
        .append("circle")
        .attr("r", 8)
        .attr("fill", "var(--ink)")
        .attr("opacity", 0.92);

      centerNode
        .append("path")
        .attr("d", genreAccentArc())
        .attr("fill", "var(--hl)")
        .attr("opacity", 0.95);

      centerNode
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", -13)
        .attr("fill", "var(--ink-dim)")
        .attr("font-family", "var(--font-mono)")
        .attr("font-size", 8.5)
        .attr("font-weight", 700)
        .attr("letter-spacing", 0)
        .text((item) => `${formatNumber(item.count)}`);

      centerNode
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", 23)
        .attr("fill", "var(--ink-3)")
        .attr("font-family", "var(--font-mono)")
        .attr("font-size", 7.5)
        .attr("font-weight", 700)
        .attr("letter-spacing", 0)
        .text("RECORDS");

      orbitNode
        .filter((item) => item.type === "artist")
        .append("circle")
        .attr("r", (item) => nodeRadius(item) + 5)
        .attr("fill", "none")
        .attr("stroke", (item) => (selectedArtist?.slug === item.slug ? "var(--hl)" : "var(--rule)"))
        .attr("stroke-width", (item) => (selectedArtist?.slug === item.slug ? 1.4 : 0.8))
        .attr("stroke-dasharray", "2 5");

      albumNode
        .append("rect")
        .attr("x", -26)
        .attr("y", -26)
        .attr("width", 52)
        .attr("height", 52)
        .attr("fill", "var(--paper-2)")
        .attr("stroke", (item) => (selectedAlbum?.slug === item.slug ? "var(--hl)" : "var(--rule-strong)"))
        .attr("stroke-width", (item) => (selectedAlbum?.slug === item.slug ? 2 : 1));

      node
        .filter((item) => Boolean(item.image))
        .append("image")
        .attr("href", (item) => item.image || "")
        .attr("x", (item) => (item.type === "album" ? -26 : -nodeRadius(item)))
        .attr("y", (item) => (item.type === "album" ? -26 : -nodeRadius(item)))
        .attr("width", (item) => (item.type === "album" ? 52 : nodeRadius(item) * 2))
        .attr("height", (item) => (item.type === "album" ? 52 : nodeRadius(item) * 2))
        .attr("clip-path", (item) => `url(#genre-clip-${safeId(item.id)})`)
        .attr("preserveAspectRatio", "xMidYMid slice")
        .attr("opacity", 0.92);

      node.append("title").text((item) => item.name);

      orbitNode
        .filter((item) => item.type === "artist" && !item.image)
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", 5)
        .attr("fill", "var(--ink-dim)")
        .attr("font-family", "var(--font-display)")
        .attr("font-size", 15)
        .attr("font-weight", 760)
        .attr("letter-spacing", 0)
        .text((item) => artistInitials(item.name));

      orbitNode
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", (item) => nodeRadius(item) + 15)
        .attr("fill", (item) => (item.type === "related" ? "var(--ink-3)" : "var(--ink)"))
        .attr("font-family", "var(--font-grot)")
        .attr("font-size", (item) => (item.type === "related" ? 10 : 11))
        .attr("font-weight", (item) => (item.type === "related" ? 600 : 700))
        .attr("letter-spacing", 0)
        .attr("paint-order", "stroke")
        .attr("stroke", "var(--paper-2)")
        .attr("stroke-width", 5)
        .attr("stroke-linejoin", "round")
        .text((item) => formatGraphLabel(item.name, item.type === "artist" ? 18 : 16));

      const genreTitle = centerNode
        .append("text")
        .attr("text-anchor", "middle")
        .attr("y", 58)
        .attr("fill", "var(--ink)")
        .attr("font-family", "var(--font-display)")
        .attr("font-size", 17)
        .attr("font-weight", 760)
        .attr("letter-spacing", 0)
        .attr("paint-order", "stroke")
        .attr("stroke", "var(--paper-2)")
        .attr("stroke-width", 6)
        .attr("stroke-linejoin", "round");

      genreTitle.each(function (item) {
        const label = d3.select(this);
        const lines = splitGraphLabel(item.name, 15, 2);
        lines.forEach((line, index) => {
          label
            .append("tspan")
            .attr("x", 0)
            .attr("dy", index === 0 ? 0 : 16)
            .text(line.toUpperCase());
        });
      });

      albumNode
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", 41)
        .attr("fill", (item) => (selectedAlbum?.slug === item.slug ? "var(--ink)" : "var(--ink-3)"))
        .attr("font-family", "var(--font-grot)")
        .attr("font-size", 10)
        .attr("font-weight", 700)
        .attr("letter-spacing", 0)
        .attr("paint-order", "stroke")
        .attr("stroke", "var(--paper-2)")
        .attr("stroke-width", 5)
        .attr("stroke-linejoin", "round")
        .text((item) => formatGraphLabel(item.name, 18));

      simulation = d3
        .forceSimulation(nodes)
        .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((item) => item.id).distance((item) => {
          if (item.kind === "album") return selectedArtist ? 96 : 116;
          if (item.kind === "related") return 168;
          return 136;
        }).strength((item) => (item.kind === "related" ? 0.26 : 0.52)))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("collision", d3.forceCollide<GraphNode>().radius((item) => nodeRadius(item) + (item.type === "album" ? 28 : 32)).strength(0.96))
        .force("x", d3.forceX<GraphNode>((item) => {
          if (item.type === "related") return width * 0.2;
          if (item.type === "artist") return width * 0.5;
          if (item.type === "album") return width * 0.78;
          return centerX;
        }).strength(0.12))
        .force("y", d3.forceY<GraphNode>((item) => {
          if (item.type === "album") return height * 0.55;
          return centerY;
        }).strength(0.08));

      const drag = d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event, item) => {
          if (!event.active) simulation?.alphaTarget(0.3).restart();
          item.fx = item.x;
          item.fy = item.y;
        })
        .on("drag", (event, item) => {
          item.fx = event.x;
          item.fy = event.y;
        })
        .on("end", (event, item) => {
          if (!event.active) simulation?.alphaTarget(0);
          if (item.type !== "genre") {
            item.fx = null;
            item.fy = null;
          }
        });

      node.call(drag);

      const update = () => {
        nodes.forEach((item) => {
          item.x = Math.max(72, Math.min(width - 72, item.x || 0));
          item.y = Math.max(68, Math.min(height - 76, item.y || 0));
        });

        link
          .attr("x1", (item) => point(item.source, "x"))
          .attr("y1", (item) => point(item.source, "y"))
          .attr("x2", (item) => point(item.target, "x"))
          .attr("y2", (item) => point(item.target, "y"));

        node.attr("transform", (item) => `translate(${item.x || 0},${item.y || 0})`);
      };

      simulation.on("tick", update);
      simulation.tick(reducedMotion ? 160 : 80);
      update();

      if (reducedMotion) {
        simulation.stop();
      } else {
        simulation.alpha(0.42).restart();
      }
    };

    const scheduleRender = () => {
      window.cancelAnimationFrame(renderFrame);
      renderFrame = window.requestAnimationFrame(render);
    };

    render();
    window.addEventListener("resize", scheduleRender);

    return () => {
      window.cancelAnimationFrame(renderFrame);
      window.removeEventListener("resize", scheduleRender);
      simulation?.stop();
      svg.on(".zoom", null);
      svg.selectAll("*").remove();
    };
  }, [
    allGenres,
    albums,
    artists,
    genre,
    nodeBudget,
    onOpenAlbum,
    onSelectArtist,
    onSelectGenre,
    selectedAlbum,
    selectedArtist,
  ]);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        className="h-[72dvh] min-h-[680px] w-full bg-paper-2"
        role="img"
        aria-label={`${genre.name} relationships between genres, artists, and albums`}
      />
      <div
        ref={tipRef}
        className="pointer-events-none absolute left-0 top-0 border border-rule-strong bg-paper px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink opacity-0 shadow-[0_10px_24px_-18px_rgba(14,13,11,0.45)] transition-opacity"
      />
    </div>
  );
}

function nodeRadius(node: GraphNode): number {
  if (node.type === "genre") return 39;
  if (node.type === "related") return 32;
  if (node.type === "artist") return Math.max(26, Math.min(42, 22 + Math.sqrt(node.count) * 4.4));
  return 24;
}

function point(value: string | number | GraphNode, axis: "x" | "y"): number {
  if (typeof value === "object") return value[axis] || 0;
  return 0;
}

function distributeY(index: number, count: number, height: number, padding: number): number {
  if (count <= 1) return height / 2;
  const top = padding;
  const bottom = height - padding;
  return top + ((bottom - top) * index) / Math.max(1, count - 1);
}

function formatGraphLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function splitGraphLabel(value: string, maxLineLength: number, maxLines: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];

  words.forEach((word) => {
    const current = lines[lines.length - 1];
    if (!current || `${current} ${word}`.length > maxLineLength) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  });

  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = formatGraphLabel(lines.slice(maxLines - 1).join(" "), maxLineLength);
  return kept;
}

function artistInitials(value: string): string {
  const initials = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials.toUpperCase() || "?";
}

function getGraphNodeCapacity(
  genre: GenreSummary | null,
  artists: GenreExplorerArtist[],
  selectedArtist: GenreExplorerArtist | null,
  albums: GenreExplorerAlbum[],
  allGenres: GenreSummary[],
): number {
  if (!genre) return NODE_BUDGET_MIN;

  const relatedCount = getRelatedGenreSummaries(genre, allGenres).length;
  const artistCount = selectedArtist
    ? 1 + artists.filter((artist) => artist.slug !== selectedArtist.slug).length
    : artists.length;
  const albumCount = selectedArtist ? albums.length : 0;

  return Math.max(NODE_BUDGET_MIN, relatedCount + artistCount + albumCount);
}

function getRelatedGenreSummaries(
  genre: GenreSummary,
  allGenres: GenreSummary[],
): GenreSummary[] {
  return genre.relatedGenres
    .map((related) => allGenres.find((candidate) => candidate.name === related.name))
    .filter((candidate): candidate is GenreSummary => Boolean(candidate));
}

function distributeNodeBudget(
  budget: number,
  totals: { related: number; artists: number; albums: number },
  hasSelectedArtist: boolean,
): { related: number; artists: number; albums: number } {
  const cappedBudget = Math.min(
    Math.max(NODE_BUDGET_MIN, Math.round(budget)),
    Math.max(NODE_BUDGET_MIN, totals.related + totals.artists + totals.albums),
  );
  const weights = hasSelectedArtist
    ? { related: 0.16, artists: 0.22, albums: 0.62 }
    : { related: 0.28, artists: 0.72, albums: 0 };
  const counts = {
    related: Math.min(totals.related, Math.floor(cappedBudget * weights.related)),
    artists: Math.min(totals.artists, Math.floor(cappedBudget * weights.artists)),
    albums: Math.min(totals.albums, Math.floor(cappedBudget * weights.albums)),
  };

  if (hasSelectedArtist && totals.artists > 0 && cappedBudget > 0) {
    counts.artists = Math.max(1, counts.artists);
  }

  const priority: Array<keyof typeof counts> = hasSelectedArtist
    ? ["albums", "artists", "related"]
    : ["artists", "related"];

  let used = counts.related + counts.artists + counts.albums;
  while (used < cappedBudget && priority.some((key) => counts[key] < totals[key])) {
    priority.forEach((key) => {
      if (used >= cappedBudget || counts[key] >= totals[key]) return;
      counts[key] += 1;
      used += 1;
    });
  }

  return counts;
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

function genreAccentArc(): string {
  return (
    d3
      .arc()
      .innerRadius(38)
      .outerRadius(41)
      .startAngle(-0.7)
      .endAngle(0.95)({}) || ""
  );
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
