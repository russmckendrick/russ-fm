import { Link } from 'react-router'
import { albumImageUrl } from '@/lib/media'
import type { LibraryItem } from '@/lib/types'
import { Cover } from './Cover'

/** Caption height under the artwork, for the virtual grid's row maths. */
export const RELEASE_TILE_CAPTION = 48

export function ReleaseTile({ item, eager }: { item: LibraryItem; eager?: boolean }) {
  return (
    <Link to={`/release/${item.slug}`} className="group block rounded-md focus-visible:outline-offset-4">
      <Cover
        src={albumImageUrl(item.slug)}
        color={item.color}
        alt={`${item.title} by ${item.artist}`}
        eager={eager}
        className="shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md"
      />
      <div className="mt-2 min-w-0" style={{ height: RELEASE_TILE_CAPTION - 8 }}>
        <p className="truncate text-[13px] leading-5 font-medium" title={item.title}>
          {item.title}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs leading-4 text-muted">
          <span className="truncate">{item.artist}</span>
          {item.year && <span className="shrink-0 text-faint tabular-nums">· {item.year}</span>}
          {item.vinyl_colours.length > 0 && (
            <span className="shrink-0 text-faint" title={item.vinyl_colours.join(', ')}>
              · ◉
            </span>
          )}
        </p>
      </div>
    </Link>
  )
}
