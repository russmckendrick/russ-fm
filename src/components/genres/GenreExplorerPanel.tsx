import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { GenreGraph } from "@/components/genres/GenreGraph";
import { genreFlood } from "@/components/genres/genreColours";
import type { ColourMap } from "@/components/browse/facetSleeves";
import { PillLink, SectionHeading } from "@/components/player";
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
import type { Flood } from "@/lib/sleeveColour";

const SORT_OPTIONS: Array<{ value: GenreExplorerSort; label: string }> = [
  { value: "dominance", label: "Most collected" },
  { value: "recent", label: "Recently added" },
  { value: "name", label: "Name" },
  { value: "year", label: "Release year" },
];

const NODE_BUDGET_MIN = 1;

/** Dropdown panels match the site's menus: rounded ground-2, cream text. */
const MENU_CONTENT =
  "rounded-2xl border-0 bg-[color:var(--ground-2)] p-1.5 font-grot text-[color:var(--cream)] shadow-[0_30px_60px_-20px_rgba(0,0,0,.7)] ring-1 ring-[color:var(--cream-rule)]";
const MENU_ITEM =
  "min-h-[44px] cursor-pointer rounded-xl py-2 pl-9 pr-3 text-[15px] font-bold text-[color:var(--cream)] focus:bg-[color:var(--ground-3)] focus:text-[color:var(--cream)]";

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
  /** album-colors.json map; nodes and the control bar take sleeve colours from it. */
  colorMap?: ColourMap;
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
  colorMap = null,
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
  const flood = genreFlood(selectedGenre, colorMap);

  return (
    <section id="genre-map" className="scroll-mt-24" aria-labelledby="genre-map-title">
      <SectionHeading
        title={<span id="genre-map-title">{selectedGenre.isAll ? "Genre map" : `${selectedGenre.name} map`}</span>}
        size="sm"
        className="mb-6"
      >
        {dossierPath && (
          <PillLink to={dossierPath} size="sm">
            {selectedGenre.name} records
          </PillLink>
        )}
      </SectionHeading>

      <div className="overflow-hidden rounded-3xl bg-[color:var(--ground-2)]">
        <div
          className="flood-surface grid gap-4 px-4 py-4 md:px-6 lg:grid-cols-[minmax(240px,1fr)_minmax(200px,1fr)_auto_minmax(220px,260px)] lg:items-end lg:gap-6"
          style={{ background: flood.flood, color: flood.ink }}
        >
          <div className="min-w-0">
            <GenreSelect
              allGenre={explorer.allGenre}
              genres={explorer.genres}
              flood={flood}
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
          <SearchControl value={query} flood={flood} onChange={onQueryChange} />
          <SortControl value={sort} flood={flood} onChange={onSortChange} />
          <NodeBudgetControl
            value={nodeBudget}
            max={nodeCapacity}
            isAuto={isAutoNodeBudget}
            flood={flood}
            onChange={onNodeBudgetChange}
          />
        </div>

        {(selectedArtist || selectedAlbum) && (
          <SelectionActions
            artist={selectedArtist}
            album={selectedAlbum}
            onClear={(key) => {
              if (key === "artist") onClearArtistFocus();
            }}
          />
        )}

        <GenreGraph
          genre={graphGenre}
          artists={artists}
          albums={albums}
          selectedArtist={selectedArtist}
          selectedAlbum={selectedAlbum}
          nodeBudget={nodeBudget}
          allGenres={explorer.genres}
          colorMap={colorMap}
          centreFlood={flood}
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

function ControlLabel({ children, flood }: { children: string; flood: Flood }) {
  return (
    <span className="t-mono mb-2 block text-[11px] font-bold uppercase" style={{ color: flood.sub }}>
      {children}
    </span>
  );
}

function GenreSelect({
  allGenre,
  genres,
  flood,
  value,
  onChange,
}: {
  allGenre: GenreSummary;
  genres: GenreSummary[];
  flood: Flood;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <ControlLabel flood={flood}>Genre</ControlLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label="Choose genre"
          className="t-disp h-auto min-h-[48px] gap-3 rounded-none border-0 bg-transparent px-0 py-1 text-left text-[26px] leading-none text-current shadow-none ring-offset-0 focus:ring-0 focus:ring-offset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current md:text-[32px] [&_.t-mono]:text-current [&_.t-mono]:opacity-70 [&>span]:line-clamp-2 [&>svg]:h-6 [&>svg]:w-6 [&>svg]:shrink-0 [&>svg]:opacity-100"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          sideOffset={8}
          className={`max-h-[min(72vh,560px)] min-w-[min(480px,calc(100vw-32px))] ${MENU_CONTENT}`}
        >
          <SelectItem value={ALL_GENRES_VALUE} className={MENU_ITEM}>
            <span className="flex w-full items-center justify-between gap-6">
              <span>All genres</span>
              <span className="t-mono text-[12px] font-normal text-[color:var(--cream-dim)]">
                {formatNumber(allGenre.albumCount)}
              </span>
            </span>
          </SelectItem>
          {genres.map((genre) => (
            <SelectItem key={genre.name} value={genre.name} className={MENU_ITEM}>
              <span className="flex w-full items-center justify-between gap-6">
                <span className="truncate">{genre.name}</span>
                <span className="t-mono text-[12px] font-normal text-[color:var(--cream-dim)]">
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
  flood,
  onChange,
}: {
  value: string;
  flood: Flood;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <ControlLabel flood={flood}>Search</ControlLabel>
      <span className="flex h-12 items-center gap-2 rounded-full border-2 border-current px-4">
        <MagnifyingGlass className="h-4 w-4 shrink-0" weight="bold" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Genre, artist, record"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-current outline-none placeholder:text-current placeholder:opacity-60 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-black/10"
          >
            <X className="h-4 w-4" weight="bold" aria-hidden />
          </button>
        )}
      </span>
    </label>
  );
}

function SortControl({
  value,
  flood,
  onChange,
}: {
  value: GenreExplorerSort;
  flood: Flood;
  onChange: (value: GenreExplorerSort) => void;
}) {
  return (
    <div className="min-w-0">
      <ControlLabel flood={flood}>Sort</ControlLabel>
      <Select value={value} onValueChange={(nextValue) => onChange(normalizeSort(nextValue))}>
        <SelectTrigger
          aria-label="Sort artists and records"
          className="h-12 w-full gap-2 rounded-full border-2 border-current bg-transparent px-4 text-[15px] font-bold text-current shadow-none ring-offset-0 focus:ring-0 focus:ring-offset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current lg:w-[190px] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:opacity-100"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={8} className={`max-h-[320px] ${MENU_CONTENT}`}>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className={MENU_ITEM}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NodeBudgetControl({
  value,
  max,
  isAuto,
  flood,
  onChange,
}: {
  value: number;
  max: number;
  isAuto: boolean;
  flood: Flood;
  onChange: (value: number | null) => void;
}) {
  const sliderMax = Math.max(NODE_BUDGET_MIN, max);
  const sliderValue = Math.min(value, sliderMax);
  const disabled = sliderMax <= NODE_BUDGET_MIN;

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="t-mono text-[11px] font-bold uppercase" style={{ color: flood.sub }}>
          Nodes
        </span>
        <span className="t-mono whitespace-nowrap text-[12px] tabular-nums" style={{ color: flood.sub }}>
          {isAuto ? `Auto ${formatNumber(sliderValue)}` : formatNumber(sliderValue)} / {formatNumber(max)}
        </span>
      </div>
      <div className="flex h-12 items-center gap-3">
        <input
          type="range"
          min={NODE_BUDGET_MIN}
          max={sliderMax}
          step={1}
          value={sliderValue}
          disabled={disabled}
          aria-label="Visible graph node count"
          onInput={(event) => onChange(Number(event.currentTarget.value))}
          className="h-11 min-w-0 flex-1 cursor-pointer bg-transparent disabled:cursor-default disabled:opacity-40"
          style={{ accentColor: flood.ink } as CSSProperties}
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={isAuto}
          className="pill pill-sm disabled:opacity-40"
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
  const pill = "pill pill-sm text-[color:var(--cream)]";
  const rule = { borderColor: "var(--cream-rule)" };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--cream-rule)] px-4 py-3 md:px-6">
      {artist && (
        <>
          <button type="button" onClick={() => onClear("artist")} className={pill} style={rule} aria-label={`Clear ${artist.name} focus`}>
            <X className="h-4 w-4" weight="bold" aria-hidden />
            {artist.name}
          </button>
          <Link to={`/artist/${artist.slug}`} className={pill} style={rule}>
            Artist page
          </Link>
        </>
      )}
      {album && (
        <Link to={album.uri} className={pill} style={rule}>
          Record page
        </Link>
      )}
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
