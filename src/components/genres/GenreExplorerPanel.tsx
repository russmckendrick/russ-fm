import { Link } from "react-router-dom";
import { ArrowSquareOut, MagnifyingGlass, SlidersHorizontal, SortAscending, X } from "@phosphor-icons/react";
import { GenreGraph } from "@/components/genres/GenreGraph";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL_GENRES_VALUE,
  normalizeSort,
  type GenreExplorerAlbum,
  type GenreExplorerArtist,
  type GenreExplorerData,
  type GenreExplorerSort,
  type GenreSummary,
} from "@/lib/genreExplorer";
import { slugify } from "@/lib/browseFacets";

const SORT_OPTIONS: Array<{ value: GenreExplorerSort; label: string }> = [
  { value: "dominance", label: "Most collected" },
  { value: "recent", label: "Recently added" },
  { value: "name", label: "Name" },
  { value: "year", label: "Release year" },
];

const NODE_BUDGET_MIN = 1;

interface GenreExplorerPanelProps {
  explorer: GenreExplorerData;
  selectedGenre: GenreSummary;
  graphGenre: GenreSummary;
  artists: GenreExplorerArtist[];
  albums: GenreExplorerAlbum[];
  selectedArtist: GenreExplorerArtist | null;
  selectedAlbum: GenreExplorerAlbum | null;
  query: string;
  sort: GenreExplorerSort;
  nodeBudget: number;
  nodeCapacity: number;
  isAutoNodeBudget: boolean;
  onQueryChange: (value: string) => void;
  onSortChange: (value: GenreExplorerSort) => void;
  onNodeBudgetChange: (value: number | null) => void;
  onGenreChange: (genre: GenreSummary) => void;
  onSelectArtist: (artist: GenreExplorerArtist) => void;
  onOpenAlbum: (album: GenreExplorerAlbum) => void;
  onBack: () => void;
  onForward: () => void;
  onClearArtistFocus: () => void;
}

export function GenreExplorerPanel({
  explorer,
  selectedGenre,
  graphGenre,
  artists,
  albums,
  selectedArtist,
  selectedAlbum,
  query,
  sort,
  nodeBudget,
  nodeCapacity,
  isAutoNodeBudget,
  onQueryChange,
  onSortChange,
  onNodeBudgetChange,
  onGenreChange,
  onSelectArtist,
  onOpenAlbum,
  onBack,
  onForward,
  onClearArtistFocus,
}: GenreExplorerPanelProps) {
  const dossierPath = selectedGenre.isAll ? null : `/genre/${slugify(selectedGenre.name)}`;

  return (
    <section id="genre-map" className="scroll-mt-24">
      <div className="mb-4 flex flex-col gap-4 border-t border-rule pt-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
            02 · Interactive map
          </p>
          <h2 className="font-display text-[clamp(34px,5vw,64px)] uppercase leading-none text-ink">
            {selectedGenre.isAll ? "Genre network" : `${selectedGenre.name} network`}
          </h2>
          <p className="mt-3 max-w-2xl font-grot text-[14px] leading-[1.6] text-ink-2 md:text-[15px]">
            Follow genre links through artists and records, then jump back to the dossier view when you want the full shelf.
          </p>
        </div>

        {dossierPath && (
          <Link
            to={dossierPath}
            className="inline-flex w-fit items-center gap-2 border border-rule-strong bg-paper px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-colors hover:border-hl hover:text-hl active:translate-y-px"
          >
            View genre dossier
            <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
          </Link>
        )}
      </div>

      <div className="overflow-hidden border border-rule-strong bg-paper">
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
                if (nextGenre) onGenreChange(nextGenre);
              }}
            />
          </div>
          <SearchControl value={query} onChange={onQueryChange} />
          <SortControl value={sort} onChange={onSortChange} />
          <NodeBudgetControl
            value={nodeBudget}
            max={nodeCapacity}
            isAuto={isAutoNodeBudget}
            onChange={onNodeBudgetChange}
          />
          <SelectionActions
            artist={selectedArtist}
            album={selectedAlbum}
            onClear={(key) => {
              if (key === "artist") onClearArtistFocus();
            }}
          />
        </div>

        <GenreGraph
          genre={graphGenre}
          artists={artists}
          albums={albums}
          selectedArtist={selectedArtist}
          selectedAlbum={selectedAlbum}
          nodeBudget={nodeBudget}
          allGenres={explorer.genres}
          onSelectGenre={onGenreChange}
          onSelectArtist={onSelectArtist}
          onOpenAlbum={onOpenAlbum}
          onBack={onBack}
          onForward={onForward}
          onClearArtistFocus={onClearArtistFocus}
        />
      </div>
    </section>
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
