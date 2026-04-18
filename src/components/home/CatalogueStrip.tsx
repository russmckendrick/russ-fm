import { Link } from "react-router-dom";
import { SectionHeader } from "@/components/layout";
import { redesignConfig } from "@/config/redesign.config";
import { getCleanGenresFromArray } from "@/lib/genreUtils";
import { getAlbumImageFromData, handleImageError } from "@/lib/image-utils";
import type { Album } from "@/types/album";

interface CatalogueStripProps {
  recentAlbums: Album[];
}

/**
 * 7-column catalogue row block. Mimics a record-shop bin divider card:
 * `#  TITLE  ARTIST  YEAR  GENRE  ADDED`. Swatches on the left pick up
 * the dominant colour from each record.
 */
export function CatalogueStrip({ recentAlbums }: CatalogueStripProps) {
  const count = redesignConfig.walls.catalogueStripCount;
  const rows = recentAlbums.slice(0, count);
  if (!rows.length) return null;

  return (
    <section className="space-y-5">
      <SectionHeader
        num="06"
        label="Catalogue · Latest Acquisitions"
        count={rows.length}
        action="Browse full catalogue"
        actionTo="/albums/1"
      />

      <div className="border border-rule-strong font-mono text-[11px] text-ink-2">
        <div className="hidden grid-cols-[56px_minmax(0,3fr)_minmax(0,2fr)_70px_minmax(0,1.4fr)_100px] items-center gap-4 border-b border-rule-strong bg-paper-2 px-4 py-2 uppercase tracking-[0.08em] text-ink-dim md:grid">
          <span>#</span>
          <span>Title</span>
          <span>Artist</span>
          <span>Year</span>
          <span>Genre</span>
          <span className="text-right">Added</span>
        </div>
        <ul>
          {rows.map((album, i) => (
            <li key={album.uri_release} className="border-b border-rule last:border-b-0">
              <CatalogueRow album={album} index={i + 1} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CatalogueRow({ album, index }: { album: Album; index: number }) {
  const cover = getAlbumImageFromData(album.uri_release, "medium");
  const year = new Date(album.date_release_year).getFullYear();
  const genre =
    getCleanGenresFromArray(album.genre_names, album.release_artist)[0] ?? "—";
  const added = formatAdded(album.date_added);

  return (
    <Link
      to={album.uri_release}
      className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 bg-paper px-4 py-3 transition-colors hover:bg-paper-2 md:grid-cols-[56px_minmax(0,3fr)_minmax(0,2fr)_70px_minmax(0,1.4fr)_100px]"
    >
      <span className="text-ink-dim">{String(index).padStart(3, "0")}</span>

      {/* Mobile-only stacked content */}
      <div className="flex flex-col gap-1 md:hidden">
        <div className="flex items-center gap-2">
          <img
            src={cover}
            alt=""
            loading="lazy"
            onError={handleImageError}
            className="h-8 w-8 shrink-0 border border-rule-strong object-cover"
          />
          <span className="truncate font-grot text-[14px] font-semibold text-ink">
            {album.release_name}
          </span>
        </div>
        <div className="truncate">{album.release_artist}</div>
        <div className="text-[10px] uppercase tracking-[0.08em] text-ink-dim">
          {year || "—"} · {genre} · Added {added}
        </div>
      </div>

      {/* Desktop columns */}
      <span className="hidden min-w-0 items-center gap-3 md:flex">
        <img
          src={cover}
          alt=""
          loading="lazy"
          onError={handleImageError}
          className="h-10 w-10 shrink-0 border border-rule-strong object-cover"
        />
        <span className="truncate font-grot text-[14px] font-semibold text-ink">
          {album.release_name}
        </span>
      </span>
      <span className="hidden truncate md:inline">{album.release_artist}</span>
      <span className="hidden md:inline">{year || "—"}</span>
      <span className="hidden truncate uppercase tracking-[0.04em] md:inline">
        {genre}
      </span>
      <span className="hidden text-right uppercase tracking-[0.04em] text-ink-dim md:inline">
        {added}
      </span>
    </Link>
  );
}

function formatAdded(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d
    .toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
    .toUpperCase();
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}
