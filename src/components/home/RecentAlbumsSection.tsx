import { AlbumCard } from "@/components/AlbumCard";
import { DragWall, SectionHeader } from "@/components/layout";
import { redesignConfig } from "@/config/redesign.config";
import type { Album } from "@/types/album";

interface RecentAlbumsSectionProps {
  recentAlbums: Album[];
}

/** Editorial "recently added · albums" drag-scroll wall. */
export function RecentAlbumsSection({ recentAlbums }: RecentAlbumsSectionProps) {
  if (!recentAlbums.length) return null;
  const count = redesignConfig.walls.recentAlbumsCount;
  const list = recentAlbums.slice(0, count);

  return (
    <section className="space-y-5">
      <SectionHeader
        num="01"
        label="Recently Added"
        count={list.length}
        action="View all"
        actionTo="/albums/1"
      />
      <DragWall ariaLabel="Recently added albums" itemBasis="min(42vw, 220px)">
        {list.map((a, i) => (
          <AlbumCard key={a.uri_release} album={a} index={i + 1} />
        ))}
      </DragWall>
    </section>
  );
}
