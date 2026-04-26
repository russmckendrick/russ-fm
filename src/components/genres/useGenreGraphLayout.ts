import { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type {
  GenreExplorerAlbum,
  GenreExplorerArtist,
  GenreSummary,
} from "@/lib/genreExplorer";

export type GenreGraphNodeType = "genre" | "related" | "artist" | "album";
export type GenreGraphLinkKind = "related" | "artist" | "album";

export interface GenreGraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: GenreGraphNodeType;
  name: string;
  count: number;
  radius: number;
  slug?: string;
  image?: string;
  genre?: GenreSummary;
  artist?: GenreExplorerArtist;
  album?: GenreExplorerAlbum;
  layoutIndex?: number;
  layoutCount?: number;
  x: number;
  y: number;
}

export interface GenreGraphLink {
  id: string;
  sourceId: string;
  targetId: string;
  kind: GenreGraphLinkKind;
}

export interface GenreGraphLayout {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  nodes: GenreGraphNode[];
  links: GenreGraphLink[];
}

interface SimulationLink extends d3.SimulationLinkDatum<GenreGraphNode> {
  source: string | GenreGraphNode;
  target: string | GenreGraphNode;
  kind: GenreGraphLinkKind;
}

interface UseGenreGraphLayoutArgs {
  genre: GenreSummary;
  artists: GenreExplorerArtist[];
  albums: GenreExplorerAlbum[];
  selectedArtist: GenreExplorerArtist | null;
  nodeBudget: number;
  allGenres: GenreSummary[];
  width: number;
  height: number;
}

const NODE_BUDGET_MIN = 1;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function useGenreGraphLayout({
  genre,
  artists,
  albums,
  selectedArtist,
  nodeBudget,
  allGenres,
  width,
  height,
}: UseGenreGraphLayoutArgs): {
  layout: GenreGraphLayout;
  setNodePosition: (id: string, x: number, y: number) => void;
} {
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [layout, setLayout] = useState<GenreGraphLayout>(() => createEmptyLayout(width, height));

  useEffect(() => {
    const nextLayout = buildSettledLayout({
      genre,
      artists,
      albums,
      selectedArtist,
      nodeBudget,
      allGenres,
      width,
      height,
      previousPositions: positionsRef.current,
    });

    positionsRef.current = new Map(
      nextLayout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    );
    setLayout(nextLayout);
  }, [albums, allGenres, artists, genre, height, nodeBudget, selectedArtist, width]);

  const setNodePosition = useCallback((id: string, x: number, y: number) => {
    setLayout((current) => {
      const node = current.nodes.find((item) => item.id === id);
      if (!node) return current;

      const nextX = clamp(x, 96, current.width - 96);
      const nextY = clamp(y, 68, current.height - 76);
      positionsRef.current.set(id, { x: nextX, y: nextY });

      return {
        ...current,
        nodes: current.nodes.map((item) => (
          item.id === id ? { ...item, x: nextX, y: nextY } : item
        )),
      };
    });
  }, []);

  return { layout, setNodePosition };
}

export function getGraphNodeCapacity(
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

export function formatGraphLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

export function splitGraphLabel(value: string, maxLineLength: number, maxLines: number): string[] {
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

export function artistInitials(value: string): string {
  const initials = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials.toUpperCase() || "?";
}

export function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function buildSettledLayout({
  genre,
  artists,
  albums,
  selectedArtist,
  nodeBudget,
  allGenres,
  width,
  height,
  previousPositions,
}: UseGenreGraphLayoutArgs & {
  previousPositions: Map<string, { x: number; y: number }>;
}): GenreGraphLayout {
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

  const nodes: GenreGraphNode[] = [
    {
      id: `genre-${genre.name}`,
      type: "genre",
      name: genre.name,
      count: genre.albumCount,
      radius: graphNodeRadius("genre", genre.albumCount, genre.name),
      genre,
      x: centerX,
      y: centerY,
      fx: centerX,
      fy: centerY,
    },
    ...shownRelated.map((related) => createNode({
      id: `related-${related.name}`,
      type: "related",
      name: related.name,
      count: related.albumCount,
      genre: related,
    })),
    ...shownArtists.map((artist) => createNode({
      id: `artist-${artist.slug}`,
      type: "artist",
      name: artist.name,
      count: artist.albumCount,
      slug: artist.slug,
      image: artist.avatar,
      artist,
    })),
    ...shownAlbums.map((album) => createNode({
      id: `album-${album.slug}`,
      type: "album",
      name: album.title,
      count: 1,
      slug: album.slug,
      image: album.cover,
      album,
    })),
  ];

  const typeTotals = {
    related: shownRelated.length,
    artist: shownArtists.length,
    album: shownAlbums.length,
  };
  const typeIndexes = {
    related: 0,
    artist: 0,
    album: 0,
  };

  nodes.forEach((node) => {
    if (node.type === "genre") return;

    const seed = seedPosition({
      node,
      width,
      height,
      selectedArtist,
      typeIndex: typeIndexes[node.type],
      typeCount: typeTotals[node.type],
    });
    node.layoutIndex = typeIndexes[node.type];
    node.layoutCount = typeTotals[node.type];
    typeIndexes[node.type] += 1;

    const previous = previousPositions.get(node.id);
    node.x = previous ? clamp(previous.x, 96, width - 96) : seed.x;
    node.y = previous ? clamp(previous.y, 68, height - 76) : seed.y;
  });

  const links: GenreGraphLink[] = [
    ...shownRelated.map((related) => ({
      id: `related:${genre.name}:${related.name}`,
      sourceId: `genre-${genre.name}`,
      targetId: `related-${related.name}`,
      kind: "related" as const,
    })),
    ...shownArtists.map((artist) => ({
      id: `artist:${genre.name}:${artist.slug}`,
      sourceId: `genre-${genre.name}`,
      targetId: `artist-${artist.slug}`,
      kind: "artist" as const,
    })),
    ...shownAlbums.map((album) => {
      const owner =
        selectedArtist ||
        shownArtists.find((artist) => artist.name.toLowerCase() === album.artist.toLowerCase()) ||
        shownArtists[0];
      return {
        id: `album:${owner?.slug || genre.name}:${album.slug}`,
        sourceId: owner ? `artist-${owner.slug}` : `genre-${genre.name}`,
        targetId: `album-${album.slug}`,
        kind: "album" as const,
      };
    }),
  ];

  const simulationLinks: SimulationLink[] = links.map((link) => ({
    source: link.sourceId,
    target: link.targetId,
    kind: link.kind,
  }));

  d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink<GenreGraphNode, SimulationLink>(simulationLinks).id((item) => item.id).distance((item) => {
      if (item.kind === "album") return selectedArtist ? 116 : 132;
      if (item.kind === "related") return 360;
      return 176;
    }).strength((item) => (item.kind === "related" ? 0.045 : 0.44)))
    .force("charge", d3.forceManyBody<GenreGraphNode>().strength((item) => {
      if (item.type === "related") return -260;
      if (item.type === "album") return -240;
      if (item.type === "artist") return -420;
      return -520;
    }))
    .force("collision", d3.forceCollide<GenreGraphNode>().radius((item) => item.radius + collisionPadding(item)).strength(0.98))
    .force("x", d3.forceX<GenreGraphNode>((item) => {
      if (item.type === "related") {
        return relatedPerimeterPoint(item.layoutIndex ?? 0, item.layoutCount ?? 1, width, height).x;
      }
      if (item.type === "artist") {
        return artistFieldPoint(item.layoutIndex ?? 0, item.layoutCount ?? 1, width, height).x;
      }
      if (item.type === "album") return width * 0.78;
      return centerX;
    }).strength((item) => {
      if (item.type === "related") return 0.42;
      if (item.type === "artist") return 0.18;
      return 0.12;
    }))
    .force("y", d3.forceY<GenreGraphNode>((item) => {
      if (item.type === "album") return height * 0.55;
      if (item.type === "related") {
        return relatedPerimeterPoint(item.layoutIndex ?? 0, item.layoutCount ?? 1, width, height).y;
      }
      if (item.type === "artist") {
        return artistFieldPoint(item.layoutIndex ?? 0, item.layoutCount ?? 1, width, height).y;
      }
      return centerY;
    }).strength((item) => {
      if (item.type === "related") return 0.36;
      if (item.type === "artist") return 0.16;
      return 0.08;
    }))
    .stop()
    .tick(240);

  return {
    width,
    height,
    centerX,
    centerY,
    nodes: nodes.map((node) => ({
      ...node,
      x: clamp(node.x || centerX, 96, width - 96),
      y: clamp(node.y || centerY, 68, height - 76),
      fx: undefined,
      fy: undefined,
      vx: 0,
      vy: 0,
    })),
    links,
  };
}

function createNode(
  node: Omit<GenreGraphNode, "radius" | "x" | "y">,
): GenreGraphNode {
  const radius = graphNodeRadius(node.type, node.count, node.name);
  return {
    ...node,
    radius,
    x: 0,
    y: 0,
  };
}

function seedPosition({
  node,
  width,
  height,
  selectedArtist,
  typeIndex,
  typeCount,
}: {
  node: GenreGraphNode;
  width: number;
  height: number;
  selectedArtist: GenreExplorerArtist | null;
  typeIndex: number;
  typeCount: number;
}): { x: number; y: number } {
  if (node.type === "related") {
    return relatedPerimeterPoint(typeIndex, typeCount, width, height);
  }

  if (node.type === "artist") {
    const selectedNudge = selectedArtist?.slug === node.slug ? { x: -34, y: 0 } : { x: 0, y: 0 };
    const point = artistFieldPoint(typeIndex, typeCount, width, height);
    return { x: point.x + selectedNudge.x, y: point.y + selectedNudge.y };
  }

  const columns = selectedArtist ? 3 : 2;
  const col = typeIndex % columns;
  const row = Math.floor(typeIndex / columns);
  const rows = Math.ceil(typeCount / columns);

  return {
    x: width * (selectedArtist ? 0.68 : 0.72) + col * Math.min(104, width * 0.075),
    y: distributeY(row, rows, height, 96),
  };
}

function graphNodeRadius(type: GenreGraphNodeType, count: number, name = ""): number {
  if (type === "genre") return 52;
  if (type === "related") return Math.max(38, Math.min(74, name.length * 3.4 + 24));
  if (type === "artist") return Math.max(26, Math.min(42, 22 + Math.sqrt(count) * 4.4));
  return 24;
}

function collisionPadding(node: GenreGraphNode): number {
  if (node.type === "genre") return 52;
  if (node.type === "album") return 34;
  if (node.type === "related") return 20;
  return 42;
}

function artistFieldPoint(
  index: number,
  count: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const total = Math.max(1, count);
  const angle = index * GOLDEN_ANGLE - Math.PI / 2;
  const progress = Math.sqrt((index + 0.5) / total);
  const centerX = width * 0.48;
  const centerY = height * 0.5;
  const radiusX = width * (0.12 + 0.17 * progress);
  const radiusY = height * (0.1 + 0.18 * progress);

  return {
    x: clamp(centerX + Math.cos(angle) * radiusX, 142, width - 142),
    y: clamp(centerY + Math.sin(angle) * radiusY, 122, height - 148),
  };
}

function relatedPerimeterPoint(
  index: number,
  count: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const total = Math.max(1, count);
  const angle = ((index + 0.5) / total) * Math.PI * 2 - Math.PI / 2;
  const centerX = width * 0.48;
  const centerY = height * 0.5;
  const radiusX = Math.max(1, width * 0.43);
  const radiusY = Math.max(1, height * 0.42);

  return {
    x: clamp(centerX + Math.cos(angle) * radiusX, 96, width - 96),
    y: clamp(centerY + Math.sin(angle) * radiusY, 64, height - 58),
  };
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

function createEmptyLayout(width: number, height: number): GenreGraphLayout {
  return {
    width,
    height,
    centerX: width * 0.48,
    centerY: height * 0.5,
    nodes: [],
    links: [],
  };
}

function distributeY(index: number, count: number, height: number, padding: number): number {
  if (count <= 1) return height / 2;
  const top = padding;
  const bottom = height - padding;
  return top + ((bottom - top) * index) / Math.max(1, count - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
