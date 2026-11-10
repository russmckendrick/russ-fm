import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getAlbumImageFromData } from '@/lib/image-utils';
import type { IndexRoomId } from '@/lib/indexHeaders';
import { cn } from '@/lib/utils';
import { IndexRoom } from './IndexRoom';

export interface RoomSleeve {
  /** The record whose sleeve shows in the slot. */
  uri: string;
  /** Where the slot links. */
  to: string;
  /** The link's accessible name, and its tooltip. */
  label: string;
}

interface SleeveRoomProps {
  room: IndexRoomId;
  /** The page's flood. */
  tint: string;
  /** One per slot, left to right; a missing one leaves its slot dark. */
  sleeves: Array<RoomSleeve | null | undefined>;
  /** Drawn in a slot instead of the sleeve image (the discs on /coloured-vinyl). */
  renderInside?: (sleeve: RoomSleeve, i: number) => ReactNode;
  /** Darken the top of a pale photo so the see-through header reads over it. */
  topShade?: boolean;
}

/**
 * The browse pages' header photo (/browse, the facet lists and pages,
 * /coloured-vinyl): an IndexRoom whose slots are linked sleeves, pulled up
 * under the see-through header like the /albums ledge. The page's band sits below it.
 */
export function SleeveRoom({ room, tint, sleeves, renderInside, topShade }: SleeveRoomProps) {
  return (
    <IndexRoom
      room={room}
      tint={tint}
      // Pulled up under the sticky header (64px, 84px from md), which is see-through here.
      className={cn('-mt-16 h-[clamp(380px,110vw,560px)] md:-mt-[84px] md:h-[clamp(440px,64svh,700px)]', topShade && 'room-top-shade')}
      renderSlot={i => {
        const s = sleeves[i];
        if (!s) return null;
        return (
          <Link to={s.to} className="index-room-sleeve" title={s.label} aria-label={s.label}>
            {renderInside ? renderInside(s, i) : <img src={getAlbumImageFromData(s.uri, 'medium')} alt="" decoding="async" />}
          </Link>
        );
      }}
    />
  );
}
