import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";

interface FilterBarProps {
  sortBy: string;
  setSortBy: (value: string) => void;
  selectedGenre: string;
  setSelectedGenre: (value: string) => void;
  selectedYear: string;
  setSelectedYear: (value: string) => void;
  genres: string[];
  years: string[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

/**
 * Editorial filter row for browse pages. Wide search field on the left,
 * three compact `LABEL · control` cells on the right joined by hairline
 * rules. Inline `Clear` only appears once something is actually filtered.
 */
export function FilterBar({
  sortBy,
  setSortBy,
  selectedGenre,
  setSelectedGenre,
  selectedYear,
  setSelectedYear,
  genres,
  years,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search albums...",
}: FilterBarProps) {
  const hasActiveFilters =
    sortBy !== "date_added" ||
    selectedGenre !== "all" ||
    selectedYear !== "all" ||
    searchValue !== "";

  const clearFilters = () => {
    setSortBy("date_added");
    setSelectedGenre("all");
    setSelectedYear("all");
    onSearchChange?.("");
  };

  return (
    <div className="mb-8 flex flex-col gap-3 border-y border-rule-strong bg-paper-2/40 px-4 py-3 md:flex-row md:items-stretch md:gap-0 md:divide-x md:divide-rule-strong md:px-0">
      {onSearchChange && (
        <label className="relative flex min-w-0 items-center gap-2 px-0 focus-within:text-ink md:flex-1 md:px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-dim" aria-hidden />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full min-w-0 bg-transparent font-grot text-[14px] text-ink placeholder:text-ink-dim focus:outline-none"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="shrink-0 text-ink-dim transition-colors hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      )}

      <FilterCell label="Sort">
        <EditorialSelect
          value={sortBy}
          onValueChange={setSortBy}
          items={[
            { value: "date_added", label: "Recently Added" },
            { value: "release_name", label: "Album Name" },
            { value: "release_artist", label: "Artist Name" },
            { value: "date_release_year", label: "Release Year" },
          ]}
        />
      </FilterCell>

      <FilterCell label="Genre">
        <EditorialSelect
          value={selectedGenre}
          onValueChange={setSelectedGenre}
          items={[
            { value: "all", label: "All" },
            ...genres.map((g) => ({ value: g, label: g })),
          ]}
          triggerClass="min-w-[140px]"
        />
      </FilterCell>

      <FilterCell label="Year">
        <EditorialSelect
          value={selectedYear}
          onValueChange={setSelectedYear}
          items={[
            { value: "all", label: "All" },
            ...years.map((y) => ({ value: y, label: y })),
          ]}
          triggerClass="min-w-[96px]"
        />
      </FilterCell>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="group flex items-center gap-2 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors hover:text-hl"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}

function FilterCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-0 py-1.5 md:px-4 md:py-2">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </span>
      {children}
    </div>
  );
}

function EditorialSelect({
  value,
  onValueChange,
  items,
  triggerClass,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: Array<{ value: string; label: string }>;
  triggerClass?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`h-8 gap-2 border-0 bg-transparent px-0 font-grot text-[13px] font-medium tracking-[-0.005em] text-ink shadow-none focus:ring-0 focus:ring-offset-0 ${triggerClass ?? ""}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-none border border-rule-strong font-grot">
        {items.map((it) => (
          <SelectItem
            key={it.value}
            value={it.value}
            className="rounded-none font-grot text-[13px]"
          >
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
