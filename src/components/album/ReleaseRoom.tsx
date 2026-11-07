import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Vinyl } from '@/components/player';
import { RoomArm } from './RoomArm';
import { getReleaseRoomUrl } from '@/lib/image-utils';
import { RELEASE_ROOM_ASPECT, type ReleaseRoom as Room } from '@/lib/releaseRooms';
import type { VinylLook } from '@/lib/vinylLook';
import { cn } from '@/lib/utils';

export interface RoomRecord {
  key: string;
  room: Room;
  /** The sleeve, shown in the stand and printed on the record's label. */
  cover: string;
  alt: string;
  /** The pressing on the platter (disc 1); black without one. */
  look: VinylLook | null;
  /** The label's colour behind the printed sleeve. */
  labelColour: string;
  /** Where the sleeve links to (the home page's records). */
  href?: string;
}

interface ReleaseRoomProps {
  records: RoomRecord[];
  /** The record on show; the others wait, faded out, so switching is a crossfade. */
  active: number;
  /** The room takes this colour (the sleeve's flood), like the /tv rooms. */
  tint: string;
  /** Spin at 45 (while scrobbling). */
  fast?: boolean;
  /** Laid over the active sleeve's box (the shop sticker positions itself on its corner). */
  sticker?: ReactNode;
  /** Pixels at the top covered by the see-through header (its height by default); the stand centres below them. */
  topInset?: number;
  /** How far to move in on the stand: 1 shows more room. */
  zoom?: number;
  className?: string;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Port of TvRoom's layout(): size the photo so the stand's sleeve is a
 * sensible size for the box, framing the stand and turntable together when
 * both fit (just the stand on phones), the photo still covering the box.
 */
function layout(room: Room, w: number, fullH: number, zoom: number, inset: number) {
  const h = Math.max(1, fullH - inset);
  const s = room.sleeve;
  const d = room.record;
  const target = Math.min(Math.max(w * 0.22 * zoom, Math.min(w * 0.6, 260)), 520 * zoom, h * 0.5 * zoom, h * 0.72);
  const width = Math.max(target / (s.width / 100), w, fullH * RELEASE_ROOM_ASPECT);
  const height = width / RELEASE_ROOM_ASPECT;
  const span = ((d.x + d.rx - s.left) / 100) * width;
  const cx = ((span < w * 0.94 ? (s.left + d.x + d.rx) / 2 : s.left + s.width / 2) / 100) * width;
  const cy = ((s.top + s.height / 2) / 100) * height;
  const left = Math.min(0, Math.max(w - width, w / 2 - cx));
  const top = Math.min(0, Math.max(fullH - height, inset + h * 0.46 - cy));
  // The sleeve overlaps the stand's lip a little so no green fringe shows.
  const bleed = 3;
  const sleeve: Box = {
    left: left + (s.left / 100) * width - bleed,
    top: top + (s.top / 100) * height - bleed,
    width: (s.width / 100) * width + bleed * 2,
    height: (s.height / 100) * height + bleed * 2,
  };
  // The record: a circle round the spindle, big enough to fill the photo's cut-out
  // (the photo hides the rest), squashed into the turntable's perspective.
  const size = 2 * d.cover * (d.rx / 100) * width;
  const squash = d.ry / d.rx / RELEASE_ROOM_ASPECT;
  // The grooves and light don't turn, so they sit on the record's outline rather
  // than round the spindle: its centre and radius in the unsquashed disc's pixels.
  const faceR = (d.rx / 100) * width;
  const record = {
    left: left + (d.x / 100) * width - size / 2,
    top: top + (d.y / 100) * height - size / 2,
    size,
    squash,
    faceX: size / 2 + ((d.fx - d.x) / 100) * width - faceR,
    faceY: size / 2 + ((d.fy - d.y) / 100) * height / squash - faceR,
    face: faceR * 2,
  };
  return { img: { left, top, width, height }, sleeve, record };
}

/**
 * The album hero: the sleeve on a stand and the record playing on the
 * turntable, in a room photo (src/lib/releaseRooms.ts). The photos have the
 * stand's board and the record cut out; the sleeve and a spinning Vinyl sit
 * under the photo, so the stand's lip and the tonearm stay on top. A masked
 * colour layer tints the room with the sleeve's flood, as on /tv.
 *
 * Several records (the home page) share one room per photo: records in the
 * same room crossfade in place, and a record in another room crossfades the
 * whole room.
 *
 * A room with `arm` has no tonearm in its photo; RoomArm draws one in 3D. It
 * cues in once the room shows, and between two records in that room it lifts
 * and parks before the record swaps, then cues back in.
 */
export function ReleaseRoom({ records, active, tint, fast = false, sticker, topInset, zoom = 1.5, className }: ReleaseRoomProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // A room shows once its photo has loaded, so the record never shows without the room round it.
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set());

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The record on show: the active one once its room's photo is ready; until
  // then the previous one stays, so switching never fades through black. In a
  // room with a 3D arm, a record in the same room waits for the arm to park.
  const [shown, setShown] = useState(active);
  const target = records[active];
  const parkFirst = !!target && shown !== active && target.room.id === records[shown]?.room.id && !!target.room.arm;
  if (shown !== active && target && loaded.has(target.room.id) && !parkFirst) setShown(active);
  const current = records[shown] ?? records[active];
  // If the arm never reports back (no WebGL), swap anyway.
  useEffect(() => {
    if (!parkFirst) return;
    const t = window.setTimeout(() => setShown(active), 3500);
    return () => window.clearTimeout(t);
  }, [parkFirst, active]);
  const currentRoom = current?.room.id ?? null;
  // Only the rooms in play are mounted (a decoded photo is tens of MB): the one
  // on show, the active and next records' (loading) and the one fading out.
  const [roomState, setRoomState] = useState<{ current: string | null; leaving: string | null }>({ current: currentRoom, leaving: null });
  if (roomState.current !== currentRoom) setRoomState({ current: currentRoom, leaving: roomState.current });
  useEffect(() => {
    if (!roomState.leaving) return;
    const t = window.setTimeout(() => setRoomState(prev => ({ ...prev, leaving: null })), 1300);
    return () => window.clearTimeout(t);
  }, [roomState.leaving]);
  const mounted = new Set([currentRoom, records[active]?.room.id, records[(active + 1) % records.length]?.room.id, roomState.leaving]);
  // The sticky header: 64px, 84px from md.
  const inset = topInset ?? (size && size.w >= 768 ? 84 : 64);
  const rooms = [...new Map(records.filter(r => mounted.has(r.room.id)).map(r => [r.room.id, r.room])).values()];
  const activeSleeve = size && current && loaded.has(current.room.id) ? layout(current.room, size.w, size.h, zoom, inset).sleeve : null;

  return (
    <div ref={box} className={cn('release-room relative overflow-hidden', className)}>
      {size &&
        rooms.map(room => {
          const g = layout(room, size.w, size.h, zoom, inset);
          const on = room.id === current?.room.id;
          const src = getReleaseRoomUrl(room.id, 'hi-res');
          const medium = getReleaseRoomUrl(room.id, 'medium');
          return (
            <div key={room.id} className={cn('release-room-layer', on && loaded.has(room.id) && 'is-on')} aria-hidden={!on}>
              {records.map((r, i) => {
                if (r.room.id !== room.id) return null;
                const showing = i === records.indexOf(current);
                const sleeve = <img src={r.cover} alt={showing ? r.alt : ''} className="h-full w-full object-cover" decoding="async" />;
                return (
                  <div key={r.key} className={cn('release-room-record', showing && 'is-on')}>
                    <div className="release-room-sleeve" style={g.sleeve}>
                      {r.href ? (
                        <Link to={r.href} tabIndex={showing ? 0 : -1} aria-label={r.alt} className="block h-full w-full">
                          {sleeve}
                        </Link>
                      ) : (
                        sleeve
                      )}
                    </div>
                    <Vinyl
                      label={r.labelColour}
                      cover={r.cover}
                      look={r.look}
                      spin={showing}
                      fast={showing && fast}
                      className={cn('room-vinyl', !r.look && 'room-vinyl-black')}
                      style={
                        {
                          left: g.record.left,
                          top: g.record.top,
                          width: g.record.size,
                          height: g.record.size,
                          transform: `scaleY(${g.record.squash})`,
                          '--face-x': `${g.record.faceX}px`,
                          '--face-y': `${g.record.faceY}px`,
                          '--face': `${g.record.face}px`,
                          '--label': `${(room.record.hole / room.record.cover) * 100}%`,
                          '--room-light': room.light,
                        } as CSSProperties
                      }
                    />
                  </div>
                );
              })}
              <img
                src={src}
                srcSet={`${medium} 3072w, ${src} 4608w`}
                sizes={`${Math.round(g.img.width)}px`}
                alt=""
                className="release-room-photo"
                style={g.img}
                decoding="async"
                onLoad={e =>
                  // Wait for the decode too: a big photo can be loaded but not yet painted.
                  e.currentTarget
                    .decode()
                    .catch(() => {})
                    .then(() => setLoaded(prev => (prev.has(room.id) ? prev : new Set(prev).add(room.id))))
                }
              />
              <div
                className="release-room-tint"
                style={{ ...g.img, background: tint, WebkitMaskImage: `url(${medium})`, maskImage: `url(${medium})` }}
              />
              {room.arm && (
                <RoomArm
                  room={room}
                  img={g.img}
                  fast={fast}
                  down={on && loaded.has(room.id) && !parkFirst}
                  onSettled={down => {
                    if (!down && on && parkFirst) setShown(active);
                  }}
                />
              )}
            </div>
          );
        })}
      {activeSleeve && sticker && (
        <div className="release-room-sticker" style={activeSleeve}>
          {sticker}
        </div>
      )}
    </div>
  );
}
