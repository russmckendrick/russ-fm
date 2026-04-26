import { useCallback, useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  getArtistGenreSummaries,
  getRelatedArtistsForArtist,
  type ArtistConnection,
  GenreExplorerAlbum,
  GenreExplorerArtist,
  GenreSummary,
} from "@/lib/genreExplorer";

export type GenreGraphMode = "genre" | "artist";
export type GenreGraphNodeType = "genre" | "artist" | "album";
export type GenreGraphNodeRole = "center" | "genre" | "artist" | "related-artist" | "album";
export type GenreGraphLinkKind = "genre" | "artist" | "album";

export interface GenreGraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: GenreGraphNodeType;
  role: GenreGraphNodeRole;
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
  mode: GenreGraphMode;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  centerNodeId: string | null;
  nodes: GenreGraphNode[];
  links: GenreGraphLink[];
}

interface SimulationLink extends d3.SimulationLinkDatum<GenreGraphNode> {
  source: string | GenreGraphNode;
  target: string | GenreGraphNode;
  kind: GenreGraphLinkKind;
}

interface GraphBuildResult {
  mode: GenreGraphMode;
  centerNodeId: string;
  nodes: GenreGraphNode[];
  links: GenreGraphLink[];
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

  if (selectedArtist) {
    const artistGenres = getArtistGenreSummaries(selectedArtist, allGenres).length;
    const relatedArtists = getRelatedArtistsForArtist(selectedArtist, allGenres).length;
    return Math.max(NODE_BUDGET_MIN, artistGenres + albums.length + relatedArtists);
  }

  const relatedCount = getRelatedGenreSummaries(genre, allGenres).length;

  return Math.max(NODE_BUDGET_MIN, relatedCount + artists.length);
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
  const graph = selectedArtist
    ? buildArtistFocusGraph({
      selectedArtist,
      albums,
      nodeBudget,
      allGenres,
      centerX,
      centerY,
    })
    : buildGenreFocusGraph({
      genre,
      artists,
      nodeBudget,
      allGenres,
      centerX,
      centerY,
    });
  const { mode, centerNodeId, nodes, links } = graph;

  seedGraphNodes({
    nodes,
    mode,
    width,
    height,
    centerX,
    centerY,
    previousPositions,
  });

  const simulationLinks: SimulationLink[] = links.map((link) => ({
    source: link.sourceId,
    target: link.targetId,
    kind: link.kind,
  }));

  d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink<GenreGraphNode, SimulationLink>(simulationLinks).id((item) => item.id).distance((item) => linkDistance(item.kind, mode)).strength((item) => linkStrength(item.kind, mode)))
    .force("charge", d3.forceManyBody<GenreGraphNode>().strength((item) => nodeCharge(item)))
    .force("collision", d3.forceCollide<GenreGraphNode>().radius((item) => item.radius + collisionPadding(item)).strength(0.98))
    .force("x", d3.forceX<GenreGraphNode>((item) => targetPoint(item, mode, width, height, centerX, centerY).x).strength((item) => targetStrength(item, mode).x))
    .force("y", d3.forceY<GenreGraphNode>((item) => targetPoint(item, mode, width, height, centerX, centerY).y).strength((item) => targetStrength(item, mode).y))
    .stop()
    .tick(mode === "artist" ? 280 : 240);

  return {
    mode,
    width,
    height,
    centerX,
    centerY,
    centerNodeId,
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

function buildGenreFocusGraph({
  genre,
  artists,
  nodeBudget,
  allGenres,
  centerX,
  centerY,
}: {
  genre: GenreSummary;
  artists: GenreExplorerArtist[];
  nodeBudget: number;
  allGenres: GenreSummary[];
  centerX: number;
  centerY: number;
}): GraphBuildResult {
  const relatedCandidates = getRelatedGenreSummaries(genre, allGenres);
  const sliceCounts = distributeGenreNodeBudget(
    nodeBudget,
    {
      related: relatedCandidates.length,
      artists: artists.length,
    },
  );
  const shownRelated = relatedCandidates.slice(0, sliceCounts.related);
  const shownArtists = artists.slice(0, sliceCounts.artists);

  const nodes: GenreGraphNode[] = [
    {
      id: `genre-${genre.name}`,
      type: "genre",
      role: "center",
      name: genre.name,
      count: genre.albumCount,
      radius: graphNodeRadius("genre", genre.albumCount, genre.name, "center"),
      genre,
      x: centerX,
      y: centerY,
      fx: centerX,
      fy: centerY,
    },
    ...shownRelated.map((related) => createNode({
      id: `genre-${related.name}`,
      type: "genre",
      role: "genre",
      name: related.name,
      count: related.albumCount,
      genre: related,
    })),
    ...shownArtists.map((artist) => createNode({
      id: `artist-${artist.slug}`,
      type: "artist",
      role: "artist",
      name: artist.name,
      count: artist.albumCount,
      slug: artist.slug,
      image: artist.avatar,
      artist,
    })),
  ];

  const links: GenreGraphLink[] = [
    ...shownRelated.map((related) => ({
      id: `genre:${genre.name}:${related.name}`,
      sourceId: `genre-${genre.name}`,
      targetId: `genre-${related.name}`,
      kind: "genre" as const,
    })),
    ...shownArtists.map((artist) => ({
      id: `artist:${genre.name}:${artist.slug}`,
      sourceId: `genre-${genre.name}`,
      targetId: `artist-${artist.slug}`,
      kind: "artist" as const,
    })),
  ];

  return {
    mode: "genre",
    centerNodeId: `genre-${genre.name}`,
    nodes,
    links,
  };
}

function buildArtistFocusGraph({
  selectedArtist,
  albums,
  nodeBudget,
  allGenres,
  centerX,
  centerY,
}: {
  selectedArtist: GenreExplorerArtist;
  albums: GenreExplorerAlbum[];
  nodeBudget: number;
  allGenres: GenreSummary[];
  centerX: number;
  centerY: number;
}): GraphBuildResult {
  const genreCandidates = getArtistGenreSummaries(selectedArtist, allGenres);
  const relatedArtistCandidates = getRelatedArtistsForArtist(selectedArtist, allGenres);
  const sliceCounts = distributeArtistNodeBudget(nodeBudget, {
    genres: genreCandidates.length,
    albums: albums.length,
    relatedArtists: relatedArtistCandidates.length,
  });
  const shownGenres = genreCandidates.slice(0, sliceCounts.genres);
  const shownAlbums = albums.slice(0, sliceCounts.albums);
  const shownGenreNames = new Set(shownGenres.map((item) => item.name));
  const shownRelatedArtists = relatedArtistCandidates
    .map((connection) => ({
      ...connection,
      visibleGenreName: connection.sharedGenres.find((name) => shownGenreNames.has(name)) || null,
    }))
    .filter((connection): connection is ArtistConnection & { visibleGenreName: string } => Boolean(connection.visibleGenreName))
    .slice(0, sliceCounts.relatedArtists);

  const nodes: GenreGraphNode[] = [
    {
      id: `artist-${selectedArtist.slug}`,
      type: "artist",
      role: "center",
      name: selectedArtist.name,
      count: selectedArtist.totalAlbumCount || selectedArtist.albumCount,
      radius: graphNodeRadius("artist", selectedArtist.totalAlbumCount || selectedArtist.albumCount, selectedArtist.name, "center"),
      slug: selectedArtist.slug,
      image: selectedArtist.avatar,
      artist: selectedArtist,
      x: centerX,
      y: centerY,
      fx: centerX,
      fy: centerY,
    },
    ...shownGenres.map((artistGenre) => createNode({
      id: `genre-${artistGenre.name}`,
      type: "genre",
      role: "genre",
      name: artistGenre.name,
      count: artistGenre.albumCount,
      genre: artistGenre,
    })),
    ...shownAlbums.map((album) => createNode({
      id: `album-${album.slug}`,
      type: "album",
      role: "album",
      name: album.title,
      count: 1,
      slug: album.slug,
      image: album.cover,
      album,
    })),
    ...shownRelatedArtists.map((connection) => createNode({
      id: `artist-${connection.artist.slug}`,
      type: "artist",
      role: "related-artist",
      name: connection.artist.name,
      count: connection.artist.totalAlbumCount || connection.artist.albumCount,
      slug: connection.artist.slug,
      image: connection.artist.avatar,
      artist: connection.artist,
    })),
  ];

  const links: GenreGraphLink[] = [
    ...shownGenres.map((artistGenre) => ({
      id: `artist-genre:${selectedArtist.slug}:${artistGenre.name}`,
      sourceId: `artist-${selectedArtist.slug}`,
      targetId: `genre-${artistGenre.name}`,
      kind: "genre" as const,
    })),
    ...shownAlbums.map((album) => ({
      id: `artist-album:${selectedArtist.slug}:${album.slug}`,
      sourceId: `artist-${selectedArtist.slug}`,
      targetId: `album-${album.slug}`,
      kind: "album" as const,
    })),
    ...shownRelatedArtists.map((connection) => ({
      id: `genre-artist:${connection.visibleGenreName}:${connection.artist.slug}`,
      sourceId: `genre-${connection.visibleGenreName}`,
      targetId: `artist-${connection.artist.slug}`,
      kind: "artist" as const,
    })),
  ];

  return {
    mode: "artist",
    centerNodeId: `artist-${selectedArtist.slug}`,
    nodes,
    links,
  };
}

function seedGraphNodes({
  nodes,
  mode,
  width,
  height,
  centerX,
  centerY,
  previousPositions,
}: {
  nodes: GenreGraphNode[];
  mode: GenreGraphMode;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  previousPositions: Map<string, { x: number; y: number }>;
}) {
  const roleTotals = new Map<GenreGraphNodeRole, number>();
  const roleIndexes = new Map<GenreGraphNodeRole, number>();

  nodes.forEach((node) => {
    if (node.role === "center") return;
    roleTotals.set(node.role, (roleTotals.get(node.role) || 0) + 1);
  });

  nodes.forEach((node) => {
    if (node.role === "center") {
      node.x = centerX;
      node.y = centerY;
      node.fx = centerX;
      node.fy = centerY;
      return;
    }

    const roleIndex = roleIndexes.get(node.role) || 0;
    const roleCount = roleTotals.get(node.role) || 1;
    node.layoutIndex = roleIndex;
    node.layoutCount = roleCount;
    roleIndexes.set(node.role, roleIndex + 1);

    const seed = seedPosition({ node, mode, width, height, centerX, centerY });
    const previous = previousPositions.get(node.id);
    node.x = previous ? clamp(previous.x, 96, width - 96) : seed.x;
    node.y = previous ? clamp(previous.y, 68, height - 76) : seed.y;
  });
}

function createNode(
  node: Omit<GenreGraphNode, "radius" | "x" | "y">,
): GenreGraphNode {
  const radius = graphNodeRadius(node.type, node.count, node.name, node.role);
  return {
    ...node,
    radius,
    x: 0,
    y: 0,
  };
}

function seedPosition({
  node,
  mode,
  width,
  height,
  centerX,
  centerY,
}: {
  node: GenreGraphNode;
  mode: GenreGraphMode;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}): { x: number; y: number } {
  const index = node.layoutIndex ?? 0;
  const count = node.layoutCount ?? 1;

  if (node.role === "center") {
    return { x: centerX, y: centerY };
  }

  if (node.role === "genre") {
    return mode === "artist"
      ? artistGenrePoint(index, count, width, height)
      : relatedPerimeterPoint(index, count, width, height);
  }

  if (node.role === "artist") {
    return artistFieldPoint(index, count, width, height);
  }

  if (node.role === "related-artist") {
    return relatedArtistPoint(index, count, width, height);
  }

  return albumOrbitPoint(index, count, width, height);
}

function targetPoint(
  node: GenreGraphNode,
  mode: GenreGraphMode,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
): { x: number; y: number } {
  return seedPosition({ node, mode, width, height, centerX, centerY });
}

function targetStrength(node: GenreGraphNode, mode: GenreGraphMode): { x: number; y: number } {
  if (node.role === "center") return { x: 1, y: 1 };
  if (node.role === "genre") {
    return mode === "artist" ? { x: 0.26, y: 0.24 } : { x: 0.42, y: 0.36 };
  }
  if (node.role === "artist") return { x: 0.18, y: 0.16 };
  if (node.role === "related-artist") return { x: 0.24, y: 0.22 };
  return { x: 0.2, y: 0.18 };
}

function linkDistance(kind: GenreGraphLinkKind, mode: GenreGraphMode): number {
  if (kind === "album") return 148;
  if (kind === "genre") return mode === "artist" ? 214 : 360;
  return mode === "artist" ? 166 : 176;
}

function linkStrength(kind: GenreGraphLinkKind, mode: GenreGraphMode): number {
  if (kind === "album") return 0.48;
  if (kind === "genre") return mode === "artist" ? 0.32 : 0.045;
  return mode === "artist" ? 0.36 : 0.44;
}

function nodeCharge(node: GenreGraphNode): number {
  if (node.role === "center") return -620;
  if (node.role === "genre") return -260;
  if (node.role === "album") return -300;
  if (node.role === "related-artist") return -340;
  return -420;
}

function graphNodeRadius(
  type: GenreGraphNodeType,
  count: number,
  name = "",
  role: GenreGraphNodeRole = "artist",
): number {
  if (role === "center") return type === "artist" ? 52 : 52;
  if (type === "genre") return Math.max(38, Math.min(74, name.length * 3.4 + 24));
  if (type === "artist") return Math.max(26, Math.min(42, 22 + Math.sqrt(count) * 4.4));
  return 31;
}

function collisionPadding(node: GenreGraphNode): number {
  if (node.role === "center") return 54;
  if (node.type === "album") return 32;
  if (node.type === "genre") return 20;
  if (node.role === "related-artist") return 36;
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

function artistGenrePoint(
  index: number,
  count: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const total = Math.max(1, count);
  const angle = ((index + 0.5) / total) * Math.PI * 2 - Math.PI / 2;
  const centerX = width * 0.48;
  const centerY = height * 0.5;
  const radiusX = width * 0.3;
  const radiusY = height * 0.29;

  return {
    x: clamp(centerX + Math.cos(angle) * radiusX, 128, width - 128),
    y: clamp(centerY + Math.sin(angle) * radiusY, 92, height - 102),
  };
}

function relatedArtistPoint(
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
  const radiusX = width * (0.24 + 0.16 * progress);
  const radiusY = height * (0.22 + 0.17 * progress);

  return {
    x: clamp(centerX + Math.cos(angle) * radiusX, 132, width - 132),
    y: clamp(centerY + Math.sin(angle) * radiusY, 106, height - 122),
  };
}

function albumOrbitPoint(
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
  const radiusX = width * (0.13 + 0.15 * progress);
  const radiusY = height * (0.12 + 0.15 * progress);

  return {
    x: clamp(centerX + Math.cos(angle) * radiusX, 116, width - 116),
    y: clamp(centerY + Math.sin(angle) * radiusY, 100, height - 116),
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

function distributeGenreNodeBudget(
  budget: number,
  totals: { related: number; artists: number },
): { related: number; artists: number } {
  const cappedBudget = Math.min(
    Math.max(NODE_BUDGET_MIN, Math.round(budget)),
    Math.max(NODE_BUDGET_MIN, totals.related + totals.artists),
  );
  const counts = {
    related: Math.min(totals.related, Math.floor(cappedBudget * 0.28)),
    artists: Math.min(totals.artists, Math.floor(cappedBudget * 0.72)),
  };

  let used = counts.related + counts.artists;
  const priority: Array<keyof typeof counts> = ["artists", "related"];
  while (used < cappedBudget && priority.some((key) => counts[key] < totals[key])) {
    priority.forEach((key) => {
      if (used >= cappedBudget || counts[key] >= totals[key]) return;
      counts[key] += 1;
      used += 1;
    });
  }

  return counts;
}

function distributeArtistNodeBudget(
  budget: number,
  totals: { genres: number; albums: number; relatedArtists: number },
): { genres: number; albums: number; relatedArtists: number } {
  const cappedBudget = Math.min(
    Math.max(NODE_BUDGET_MIN, Math.round(budget)),
    Math.max(NODE_BUDGET_MIN, totals.genres + totals.albums + totals.relatedArtists),
  );
  const counts = {
    genres: Math.min(totals.genres, Math.min(10, Math.ceil(cappedBudget * 0.3))),
    albums: Math.min(totals.albums, Math.ceil(cappedBudget * 0.45)),
    relatedArtists: 0,
  };

  let used = counts.genres + counts.albums;
  counts.relatedArtists = Math.min(totals.relatedArtists, Math.max(0, cappedBudget - used));
  used += counts.relatedArtists;

  const priority: Array<keyof typeof counts> = ["albums", "genres", "relatedArtists"];
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
    mode: "genre",
    width,
    height,
    centerX: width * 0.48,
    centerY: height * 0.5,
    centerNodeId: null,
    nodes: [],
    links: [],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
