import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import * as d3 from "d3";
import { ArrowLeft, ArrowRight, MagnifyingGlassMinus, MagnifyingGlassPlus, Target } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import type {
  GenreExplorerAlbum,
  GenreExplorerArtist,
  GenreSummary,
} from "@/lib/genreExplorer";
import {
  artistInitials,
  formatGraphLabel,
  safeId,
  splitGraphLabel,
  useGenreGraphLayout,
  type GenreGraphLink,
  type GenreGraphNode,
} from "@/components/genres/useGenreGraphLayout";

interface GenreGraphProps {
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
  onBack: () => void;
  onForward: () => void;
  onClearArtistFocus: () => void;
}

interface SurfaceSize {
  width: number;
  height: number;
}

interface TooltipState {
  visible: boolean;
  label: string;
  x: number;
  y: number;
}

const MIN_WIDTH = 760;
const MIN_HEIGHT = 620;
const FALLBACK_WIDTH = 1180;
const FALLBACK_HEIGHT = 700;
const ZOOM_MIN = 0.76;
const ZOOM_MAX = 2.2;
const CENTER_ARTIST_PORTRAIT_RADIUS = 48;
const MOTION_SPRING: Transition = { type: "spring", stiffness: 150, damping: 24, mass: 0.82 };
const LINE_SPRING: Transition = { type: "spring", stiffness: 170, damping: 28, mass: 0.78 };

export function GenreGraph({
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
  onBack,
  onForward,
  onClearArtistFocus,
}: GenreGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const graphRef = useRef<SVGGElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const draggedNodeRef = useRef<string | null>(null);
  const clipPrefix = safeId(useId());
  const surfaceSize = useSurfaceSize(surfaceRef);
  const shouldReduceMotion = useReducedMotion();
  const width = Math.max(MIN_WIDTH, Math.round(surfaceSize.width || FALLBACK_WIDTH));
  const height = Math.max(MIN_HEIGHT, Math.round(surfaceSize.height || FALLBACK_HEIGHT));
  const { layout, setNodePosition } = useGenreGraphLayout({
    genre,
    artists,
    albums,
    selectedArtist,
    nodeBudget,
    allGenres,
    width,
    height,
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    label: "",
    x: 0,
    y: 0,
  });

  useEffect(() => {
    const svgNode = svgRef.current;
    const graphNode = graphRef.current;
    if (!svgNode || !graphNode) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgNode);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .translateExtent([
        [-layout.width * 0.2, -layout.height * 0.2],
        [layout.width * 1.2, layout.height * 1.2],
      ])
      .on("zoom", (event) => {
        zoomTransformRef.current = event.transform;
        graphNode.setAttribute("transform", event.transform.toString());
      });

    zoomBehaviorRef.current = zoom;
    graphNode.setAttribute("transform", zoomTransformRef.current.toString());
    svg.call(zoom);
    svg.on("dblclick.zoom", null);

    return () => {
      svg.on(".zoom", null);
      zoomBehaviorRef.current = null;
    };
  }, [layout.height, layout.width]);

  const nodesById = useMemo(() => {
    return new Map(layout.nodes.map((node) => [node.id, node]));
  }, [layout.nodes]);
  const visibleLinks = useMemo(() => {
    return layout.links
      .map((link) => {
        const source = nodesById.get(link.sourceId);
        const target = nodesById.get(link.targetId);
        return source && target ? { link, source, target } : null;
      })
      .filter((item): item is { link: GenreGraphLink; source: GenreGraphNode; target: GenreGraphNode } => Boolean(item));
  }, [layout.links, nodesById]);

  const transition = shouldReduceMotion ? { duration: 0 } : MOTION_SPRING;
  const lineTransition = shouldReduceMotion ? { duration: 0 } : LINE_SPRING;

  const triggerNode = (node: GenreGraphNode) => {
    if (node.album) {
      onOpenAlbum(node.album);
      return;
    }
    if (node.genre && node.role !== "center") onSelectGenre(node.genre);
    if (node.artist && node.role !== "center") onSelectArtist(node.artist);
  };

  const recenterGraph = useCallback(() => {
    const svgNode = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svgNode || !zoom) return;
    d3.select<SVGSVGElement, unknown>(svgNode).call(zoom.transform, d3.zoomIdentity);
  }, []);

  const zoomGraph = useCallback((factor: number) => {
    const svgNode = svgRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svgNode || !zoom) return;
    const nextScale = zoomTransformRef.current.k * factor;
    if (nextScale < ZOOM_MIN && factor < 1) return;
    if (nextScale > ZOOM_MAX && factor > 1) return;
    d3.select<SVGSVGElement, unknown>(svgNode).call(zoom.scaleBy, factor);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;

      if (event.key === "[") {
        event.preventDefault();
        onBack();
        return;
      }
      if (event.key === "]") {
        event.preventDefault();
        onForward();
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        recenterGraph();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomGraph(1.18);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        zoomGraph(0.84);
        return;
      }
      if (event.key === "Escape" && selectedArtist) {
        event.preventDefault();
        onClearArtistFocus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack, onClearArtistFocus, onForward, recenterGraph, selectedArtist, zoomGraph]);

  const updateTooltip = (event: MouseEvent<SVGGElement>, node: GenreGraphNode) => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setTooltip({
      visible: true,
      label: tooltipLabel(node),
      x: event.clientX - bounds.left + 14,
      y: event.clientY - bounds.top + 14,
    });
  };

  const handlePointerDown = (event: PointerEvent<SVGGElement>, node: GenreGraphNode) => {
    if (node.role === "center") return;
    const point = graphPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedNodeRef.current = node.id;
    setDraggedId(node.id);
    setNodePosition(node.id, point.x, point.y);
  };

  const handlePointerMove = (event: PointerEvent<SVGGElement>, node: GenreGraphNode) => {
    if (draggedNodeRef.current !== node.id) return;
    const point = graphPoint(event);
    if (!point) return;
    event.preventDefault();
    setNodePosition(node.id, point.x, point.y);
  };

  const endDrag = (event: PointerEvent<SVGGElement>, node: GenreGraphNode) => {
    if (draggedNodeRef.current !== node.id) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    draggedNodeRef.current = null;
    setDraggedId(null);
  };

  const graphPoint = (event: PointerEvent<SVGGElement>): { x: number; y: number } | null => {
    const svgNode = svgRef.current;
    if (!svgNode) return null;
    const [rawX, rawY] = d3.pointer(event.nativeEvent, svgNode);
    const [x, y] = zoomTransformRef.current.invert([rawX, rawY]);
    return { x, y };
  };

  return (
    <div ref={surfaceRef} className="relative">
      <GraphToolbar
        onBack={onBack}
        onForward={onForward}
        onRecenter={recenterGraph}
        onZoomIn={() => zoomGraph(1.18)}
        onZoomOut={() => zoomGraph(0.84)}
      />
      <svg
        ref={svgRef}
        className="h-[72dvh] min-h-[680px] w-full touch-none bg-paper-2"
        role="img"
        aria-label={`${genre.name} relationships between genres, artists, and albums`}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {layout.nodes.filter((node) => node.image).map((node) => {
            const clipId = clipPathId(clipPrefix, node);
            const clipRadius = node.role === "center" && node.type === "artist"
              ? CENTER_ARTIST_PORTRAIT_RADIUS
              : node.radius;
            return (
              <clipPath key={clipId} id={clipId}>
                {node.type === "album" ? (
                  <rect x={-node.radius} y={-node.radius} width={node.radius * 2} height={node.radius * 2} />
                ) : (
                  <circle cx={0} cy={0} r={clipRadius} />
                )}
              </clipPath>
            );
          })}
        </defs>

        <g ref={graphRef} className="genre-graph">
          <motion.line
            x1={layout.width * 0.28}
            x2={layout.width * 0.7}
            y1={layout.centerY}
            y2={layout.centerY}
            stroke="var(--rule)"
            strokeDasharray="2 10"
            strokeLinecap="round"
            initial={false}
            animate={{ opacity: 0.48 }}
            transition={lineTransition}
          />

          <g stroke="var(--rule-strong)" strokeOpacity={0.42}>
            <AnimatePresence initial={false}>
              {visibleLinks.map(({ link, source, target }) => (
                <GraphLinkLine
                  key={link.id}
                  link={link}
                  source={source}
                  target={target}
                  isDragged={draggedId === source.id || draggedId === target.id}
                  transition={lineTransition}
                  reducedMotion={Boolean(shouldReduceMotion)}
                />
              ))}
            </AnimatePresence>
          </g>

          <AnimatePresence initial={false}>
            {layout.nodes.map((node) => (
              <GraphNodeGroup
                key={node.id}
                node={node}
                clipPrefix={clipPrefix}
                selectedArtist={selectedArtist}
                selectedAlbum={selectedAlbum}
                isHovered={hoveredId === node.id}
                isDragged={draggedId === node.id}
                reducedMotion={Boolean(shouldReduceMotion)}
                transition={transition}
                onTrigger={triggerNode}
                onHoverStart={(event) => {
                  setHoveredId(node.id);
                  updateTooltip(event, node);
                }}
                onHoverMove={(event) => updateTooltip(event, node)}
                onHoverEnd={() => {
                  setHoveredId(null);
                  setTooltip((current) => ({ ...current, visible: false }));
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
              />
            ))}
          </AnimatePresence>
        </g>
      </svg>

      <div
        className="pointer-events-none absolute left-0 top-0 border border-rule-strong bg-paper px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink shadow-[0_10px_24px_-18px_rgba(14,13,11,0.45)] transition-opacity"
        style={{
          opacity: tooltip.visible ? 1 : 0,
          transform: `translate(${tooltip.x}px, ${tooltip.y}px)`,
        }}
      >
        {tooltip.label}
      </div>
    </div>
  );
}

function GraphToolbar({
  onBack,
  onForward,
  onRecenter,
  onZoomIn,
  onZoomOut,
}: {
  onBack: () => void;
  onForward: () => void;
  onRecenter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-10 flex border border-rule-strong bg-paper/95 shadow-[0_14px_34px_-24px_rgba(14,13,11,0.45)]">
      <GraphToolButton label="Back" shortcut="[" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" weight="bold" />
      </GraphToolButton>
      <GraphToolButton label="Forward" shortcut="]" onClick={onForward}>
        <ArrowRight className="h-4 w-4" weight="bold" />
      </GraphToolButton>
      <GraphToolButton label="Recentre graph" shortcut="0" onClick={onRecenter}>
        <Target className="h-4 w-4" weight="bold" />
      </GraphToolButton>
      <GraphToolButton label="Zoom out" shortcut="-" onClick={onZoomOut}>
        <MagnifyingGlassMinus className="h-4 w-4" weight="bold" />
      </GraphToolButton>
      <GraphToolButton label="Zoom in" shortcut="+" onClick={onZoomIn}>
        <MagnifyingGlassPlus className="h-4 w-4" weight="bold" />
      </GraphToolButton>
    </div>
  );
}

function GraphToolButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut}
      title={`${label} (${shortcut})`}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center border-r border-rule text-ink-dim transition-colors last:border-r-0 hover:bg-paper-2 hover:text-hl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
    >
      {children}
    </button>
  );
}

function GraphLinkLine({
  link,
  source,
  target,
  isDragged,
  transition,
  reducedMotion,
}: {
  link: GenreGraphLink;
  source: GenreGraphNode;
  target: GenreGraphNode;
  isDragged: boolean;
  transition: Transition;
  reducedMotion: boolean;
}) {
  return (
    <motion.line
      x1={source.x}
      y1={source.y}
      x2={target.x}
      y2={target.y}
      strokeWidth={link.kind === "album" ? 0.9 : link.kind === "artist" ? 1.2 : 0.8}
      strokeDasharray={link.kind === "genre" ? "3 7" : undefined}
      initial={reducedMotion ? false : {
        x1: source.x,
        y1: source.y,
        x2: source.x,
        y2: source.y,
        opacity: 0,
      }}
      animate={{
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        opacity: link.kind === "album" ? 0.52 : 0.72,
      }}
      exit={{ opacity: 0 }}
      transition={isDragged ? { duration: 0 } : transition}
    />
  );
}

function GraphNodeGroup({
  node,
  clipPrefix,
  selectedArtist,
  selectedAlbum,
  isHovered,
  isDragged,
  reducedMotion,
  transition,
  onTrigger,
  onHoverStart,
  onHoverMove,
  onHoverEnd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  node: GenreGraphNode;
  clipPrefix: string;
  selectedArtist: GenreExplorerArtist | null;
  selectedAlbum: GenreExplorerAlbum | null;
  isHovered: boolean;
  isDragged: boolean;
  reducedMotion: boolean;
  transition: Transition;
  onTrigger: (node: GenreGraphNode) => void;
  onHoverStart: (event: MouseEvent<SVGGElement>) => void;
  onHoverMove: (event: MouseEvent<SVGGElement>) => void;
  onHoverEnd: () => void;
  onPointerDown: (event: PointerEvent<SVGGElement>, node: GenreGraphNode) => void;
  onPointerMove: (event: PointerEvent<SVGGElement>, node: GenreGraphNode) => void;
  onPointerUp: (event: PointerEvent<SVGGElement>, node: GenreGraphNode) => void;
}) {
  const isInteractive = node.role !== "center";
  const isSelectedArtist = selectedArtist?.slug === node.slug;
  const isSelectedAlbum = selectedAlbum?.slug === node.slug;
  const isActive = isSelectedArtist || isSelectedAlbum;
  const scale = node.role === "center" ? 1 : isDragged ? 1.04 : isHovered || isActive ? 1.035 : 1;

  return (
    <motion.g
      data-node-type={node.type}
      data-node-slug={node.slug || undefined}
      tabIndex={isInteractive ? 0 : undefined}
      role={isInteractive ? "button" : undefined}
      aria-label={node.type === "album" ? `Open album ${node.name}` : `${node.type} ${node.name}`}
      style={{ cursor: isInteractive ? "pointer" : "default", outline: "none" }}
      initial={reducedMotion ? false : { x: node.x, y: node.y, opacity: 0, scale: 0.9 }}
      animate={{ x: node.x, y: node.y, opacity: 1, scale }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={isDragged ? { duration: 0 } : transition}
      whileFocus={{ scale: isInteractive ? 1.04 : scale }}
      onClick={() => {
        if (isInteractive) onTrigger(node);
      }}
      onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
        if (!isInteractive || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onTrigger(node);
      }}
      onMouseEnter={onHoverStart}
      onMouseMove={onHoverMove}
      onMouseLeave={onHoverEnd}
      onPointerDown={(event) => onPointerDown(event, node)}
      onPointerMove={(event) => onPointerMove(event, node)}
      onPointerUp={(event) => onPointerUp(event, node)}
      onPointerCancel={(event) => onPointerUp(event, node)}
    >
      <title>{node.name}</title>
      {node.role === "center" && node.type === "genre" ? (
        <CenterGenreNode node={node} />
      ) : node.role === "center" && node.type === "artist" ? (
        <CenterArtistNode node={node} clipPrefix={clipPrefix} />
      ) : node.type === "album" ? (
        <AlbumNode
          node={node}
          isSelected={isSelectedAlbum}
          isLabelVisible={isHovered || isDragged || isSelectedAlbum}
          clipPrefix={clipPrefix}
        />
      ) : node.type === "genre" ? (
        <RelatedGenreChip node={node} />
      ) : (
        <OrbitNode
          node={node}
          isSelected={isSelectedArtist}
          clipPrefix={clipPrefix}
        />
      )}
    </motion.g>
  );
}

function CenterGenreNode({ node }: { node: GenreGraphNode }) {
  const titleLines = splitGraphLabel(node.name, 16, 2);

  return (
    <>
      <circle r={44} fill="var(--paper)" stroke="var(--rule-strong)" strokeWidth={1.1} />
      <circle r={35} fill="var(--paper-2)" stroke="var(--rule)" strokeWidth={0.8} />
      <BrandRecordGlyph size={48} />
      <text
        textAnchor="middle"
        y={63}
        fill="var(--ink)"
        fontFamily="var(--font-display)"
        fontSize={16}
        fontWeight={760}
        letterSpacing={0}
        paintOrder="stroke"
        stroke="var(--paper-2)"
        strokeWidth={6}
        strokeLinejoin="round"
      >
        {titleLines.map((line, index) => (
          <tspan key={`${node.id}-line-${index}`} x={0} dy={index === 0 ? 0 : 15}>
            {line.toUpperCase()}
          </tspan>
        ))}
      </text>
      <text
        textAnchor="middle"
        y={titleLines.length > 1 ? 92 : 78}
        fill="var(--ink-dim)"
        fontFamily="var(--font-mono)"
        fontSize={8.5}
        fontWeight={700}
        letterSpacing={0}
      >
        {formatNumber(node.count)} RECORDS
      </text>
    </>
  );
}

function CenterArtistNode({
  node,
  clipPrefix,
}: {
  node: GenreGraphNode;
  clipPrefix: string;
}) {
  const titleLines = splitGraphLabel(node.name, 17, 2);
  const portraitSize = CENTER_ARTIST_PORTRAIT_RADIUS * 2;

  return (
    <>
      <circle r={CENTER_ARTIST_PORTRAIT_RADIUS + 1} fill="var(--paper)" stroke="var(--rule-strong)" strokeWidth={1.1} />
      <circle r={CENTER_ARTIST_PORTRAIT_RADIUS} fill="var(--paper-2)" stroke="var(--rule)" strokeWidth={0.8} />
      {node.image ? (
        <image
          href={node.image}
          x={-CENTER_ARTIST_PORTRAIT_RADIUS}
          y={-CENTER_ARTIST_PORTRAIT_RADIUS}
          width={portraitSize}
          height={portraitSize}
          clipPath={`url(#${clipPathId(clipPrefix, node)})`}
          preserveAspectRatio="xMidYMid slice"
          opacity={0.97}
        />
      ) : (
        <text
          textAnchor="middle"
          dy={6}
          fill="var(--ink)"
          fontFamily="var(--font-display)"
          fontSize={18}
          fontWeight={780}
          letterSpacing={0}
        >
          {artistInitials(node.name)}
        </text>
      )}
      <circle r={CENTER_ARTIST_PORTRAIT_RADIUS} fill="none" stroke="var(--rule-strong)" strokeWidth={1} />
      <circle r={CENTER_ARTIST_PORTRAIT_RADIUS + 4} fill="none" stroke="var(--hl)" strokeWidth={1.4} strokeDasharray="3 6" />
      <text
        textAnchor="middle"
        y={67}
        fill="var(--ink)"
        fontFamily="var(--font-display)"
        fontSize={15.5}
        fontWeight={760}
        letterSpacing={0}
        paintOrder="stroke"
        stroke="var(--paper-2)"
        strokeWidth={6}
        strokeLinejoin="round"
      >
        {titleLines.map((line, index) => (
          <tspan key={`${node.id}-line-${index}`} x={0} dy={index === 0 ? 0 : 14}>
            {line}
          </tspan>
        ))}
      </text>
      <text
        textAnchor="middle"
        y={titleLines.length > 1 ? 95 : 82}
        fill="var(--ink-dim)"
        fontFamily="var(--font-mono)"
        fontSize={8.5}
        fontWeight={700}
        letterSpacing={0}
      >
        {formatNumber(node.count)} RECORDS
      </text>
    </>
  );
}

function BrandRecordGlyph({ size }: { size: number }) {
  const scale = size / 512;

  return (
    <g transform={`translate(${-size / 2} ${-size / 2}) scale(${scale})`} fill="var(--ink)">
      <path d="M256,0C114.837,0,0,114.837,0,256s114.837,256,256,256s256-114.837,256-256S397.163,0,256,0z M256,490.667c-129.387,0-234.667-105.28-234.667-234.667S126.613,21.333,256,21.333S490.667,126.613,490.667,256S385.387,490.667,256,490.667z" />
      <path d="M458.667,245.333c-5.888,0-10.667,4.779-10.667,10.667c0,105.856-86.144,192-192,192c-5.888,0-10.667,4.779-10.667,10.667s4.779,10.667,10.667,10.667c117.632,0,213.333-95.701,213.333-213.333C469.333,250.112,464.555,245.333,458.667,245.333z" />
      <path d="M256,64c5.888,0,10.667-4.779,10.667-10.667S261.888,42.667,256,42.667C138.368,42.667,42.667,138.368,42.667,256c0,5.888,4.779,10.667,10.667,10.667S64,261.888,64,256C64,150.144,150.144,64,256,64z" />
      <path d="M245.333,373.333c0,5.888,4.779,10.667,10.667,10.667c70.592,0,128-57.408,128-128c0-5.888-4.779-10.667-10.667-10.667c-5.888,0-10.667,4.779-10.667,10.667c0,58.816-47.851,106.667-106.667,106.667C250.112,362.667,245.333,367.445,245.333,373.333z" />
      <path d="M256,405.333c-5.888,0-10.667,4.779-10.667,10.667c0,5.888,4.779,10.667,10.667,10.667c94.101,0,170.667-76.565,170.667-170.667c0-5.888-4.779-10.667-10.667-10.667c-5.888,0-10.667,4.779-10.667,10.667C405.333,338.347,338.347,405.333,256,405.333z" />
      <path d="M256,106.667c5.888,0,10.667-4.779,10.667-10.667S261.888,85.333,256,85.333c-94.101,0-170.667,76.565-170.667,170.667c0,5.888,4.779,10.667,10.667,10.667s10.667-4.779,10.667-10.667C106.667,173.653,173.653,106.667,256,106.667z" />
      <path d="M320,256c0-35.285-28.715-64-64-64s-64,28.715-64,64s28.715,64,64,64S320,291.285,320,256z M213.333,256c0-23.531,19.136-42.667,42.667-42.667s42.667,19.136,42.667,42.667S279.531,298.667,256,298.667S213.333,279.531,213.333,256z" />
      <path d="M277.333,256c0-11.776-9.557-21.333-21.333-21.333s-21.333,9.557-21.333,21.333s9.557,21.333,21.333,21.333S277.333,267.776,277.333,256z" />
      <path d="M266.667,138.667c0-5.888-4.779-10.667-10.667-10.667c-70.592,0-128,57.408-128,128c0,5.888,4.779,10.667,10.667,10.667s10.667-4.779,10.667-10.667c0-58.816,47.851-106.667,106.667-106.667C261.888,149.333,266.667,144.555,266.667,138.667z" />
    </g>
  );
}

function OrbitNode({
  node,
  isSelected,
  clipPrefix,
}: {
  node: GenreGraphNode;
  isSelected: boolean;
  clipPrefix: string;
}) {
  return (
    <>
      <motion.circle
        r={node.radius}
        fill={isSelected ? "var(--hl)" : "var(--paper)"}
        stroke={isSelected ? "var(--hl)" : "var(--rule-strong)"}
        strokeWidth={1}
        animate={{
          filter: isSelected ? "drop-shadow(0 8px 18px rgba(182, 69, 38, 0.22))" : "drop-shadow(0 0 0 rgba(0, 0, 0, 0))",
        }}
        transition={{ duration: 0.2 }}
      />
      {node.type === "artist" && (
        <circle
          r={node.radius + 5}
          fill="none"
          stroke={isSelected ? "var(--hl)" : "var(--rule)"}
          strokeWidth={isSelected ? 1.4 : 0.8}
          strokeDasharray="2 5"
        />
      )}
      {node.image && (
        <image
          href={node.image}
          x={-node.radius}
          y={-node.radius}
          width={node.radius * 2}
          height={node.radius * 2}
          clipPath={`url(#${clipPathId(clipPrefix, node)})`}
          preserveAspectRatio="xMidYMid slice"
          opacity={0.92}
        />
      )}
      {node.type === "artist" && !node.image && (
        <text
          textAnchor="middle"
          dy={5}
          fill="var(--ink-dim)"
          fontFamily="var(--font-display)"
          fontSize={15}
          fontWeight={760}
          letterSpacing={0}
        >
          {artistInitials(node.name)}
        </text>
      )}
      <text
        textAnchor="middle"
        dy={node.radius + 15}
        fill="var(--ink)"
        fontFamily="var(--font-grot)"
        fontSize={11}
        fontWeight={700}
        letterSpacing={0}
        paintOrder="stroke"
        stroke="var(--paper-2)"
        strokeWidth={5}
        strokeLinejoin="round"
      >
        {formatGraphLabel(node.name, node.role === "related-artist" ? 16 : 18)}
      </text>
    </>
  );
}

function RelatedGenreChip({ node }: { node: GenreGraphNode }) {
  const width = Math.max(76, Math.min(148, node.radius * 2));
  const label = formatGraphLabel(node.name, width > 120 ? 18 : 13);

  return (
    <>
      <motion.rect
        x={-width / 2}
        y={-16}
        width={width}
        height={32}
        rx={7}
        fill="var(--paper)"
        stroke="var(--rule-strong)"
        strokeWidth={0.9}
        animate={{
          filter: "drop-shadow(0 12px 18px rgba(14, 13, 11, 0.08))",
        }}
        transition={{ duration: 0.2 }}
      />
      <rect
        x={-width / 2 + 6}
        y={-10}
        width={3}
        height={20}
        rx={1.5}
        fill="var(--hl)"
        opacity={0.82}
      />
      <text
        textAnchor="middle"
        dy={4}
        fill="var(--ink)"
        fontFamily="var(--font-grot)"
        fontSize={10.5}
        fontWeight={760}
        letterSpacing={0}
      >
        {label}
      </text>
    </>
  );
}

function AlbumNode({
  node,
  isSelected,
  isLabelVisible,
  clipPrefix,
}: {
  node: GenreGraphNode;
  isSelected: boolean;
  isLabelVisible: boolean;
  clipPrefix: string;
}) {
  const halfSize = node.radius;

  return (
    <>
      <rect
        x={-halfSize}
        y={-halfSize}
        width={halfSize * 2}
        height={halfSize * 2}
        fill="var(--paper-2)"
        stroke={isSelected ? "var(--hl)" : "var(--rule-strong)"}
        strokeWidth={isSelected ? 2 : 1}
      />
      {node.image && (
        <image
          href={node.image}
          x={-halfSize}
          y={-halfSize}
          width={halfSize * 2}
          height={halfSize * 2}
          clipPath={`url(#${clipPathId(clipPrefix, node)})`}
          preserveAspectRatio="xMidYMid slice"
          opacity={0.94}
        />
      )}
      <motion.text
        textAnchor="middle"
        dy={halfSize + 16}
        fill={isSelected ? "var(--ink)" : "var(--ink-3)"}
        fontFamily="var(--font-grot)"
        fontSize={10}
        fontWeight={700}
        letterSpacing={0}
        paintOrder="stroke"
        stroke="var(--paper-2)"
        strokeWidth={5}
        strokeLinejoin="round"
        initial={false}
        animate={{ opacity: isLabelVisible ? 1 : 0 }}
        transition={{ duration: 0.16 }}
      >
        {formatGraphLabel(node.name, 18)}
      </motion.text>
    </>
  );
}

function useSurfaceSize(ref: RefObject<HTMLElement | null>): SurfaceSize {
  const [size, setSize] = useState<SurfaceSize>({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const bounds = node.getBoundingClientRect();
      setSize({
        width: bounds.width,
        height: bounds.height,
      });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function clipPathId(prefix: string, node: GenreGraphNode): string {
  return `${prefix}-genre-clip-${safeId(node.id)}`;
}

function tooltipLabel(node: GenreGraphNode): string {
  if (node.type === "album") {
    return `${node.name} / ${node.album?.artist || "Unknown"}`;
  }
  return `${node.name}${node.count ? ` / ${formatNumber(node.count)}` : ""}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tagName = target.tagName.toLowerCase();

  return (
    (target instanceof HTMLElement && target.isContentEditable) ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.getAttribute("role") === "combobox"
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
