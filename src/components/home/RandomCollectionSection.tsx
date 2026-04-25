import { Link } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { AlbumCard } from "@/components/AlbumCard";
import { SectionHeader } from "@/components/layout";
import { appConfig } from "@/config/app.config";
import { cn } from "@/lib/utils";
import type { Album } from "@/types/album";

interface RandomCollectionSectionProps {
  randomCollectionItems: Album[];
  onRefresh?: () => void;
}

/**
 * Editorial "from the collection" block — a tight album grid with a
 * small mono shuffle button next to the section number.
 */
export function RandomCollectionSection({
  randomCollectionItems,
  onRefresh,
}: RandomCollectionSectionProps) {
  if (randomCollectionItems.length === 0) return null;

  const list = randomCollectionItems.slice(
    0,
    appConfig.homepage.randomCollection.displayCount
  );

  return (
    <section className="space-y-5">
      <SectionHeader
        num="04"
        label="Deep Cuts"
        count={list.length}
        action="Discover more"
        actionTo="/albums/1"
      />
      {onRefresh && (
        <div className="-mt-3 flex">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 border border-rule-strong bg-paper px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <Shuffle className="h-3 w-3" />
            Shuffle crate
          </button>
        </div>
      )}
      {/* 2×2 on phone (first 4 only, rest hidden via CSS so the
          shuffle button still operates on the full list). Reflows to
          the full 12 from sm: upward. */}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {list.map((album, i) => (
          <AlbumCard
            key={album.uri_release}
            album={album}
            index={i + 1}
            className={cn(i >= 4 && "hidden sm:block")}
          />
        ))}
      </div>
      <div className="flex justify-end border-t border-rule pt-3">
        <Link
          to="/random"
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 transition-colors hover:text-hl"
        >
          Want just one? Try Random Spin →
        </Link>
      </div>
    </section>
  );
}
