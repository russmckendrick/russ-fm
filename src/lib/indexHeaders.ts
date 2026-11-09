import headers from '@/config/index-headers.json';

/** The /albums, /artists, /stats and /shuffle header photos (scripts/process-index-headers.py); IndexRoom draws them. */
export type IndexRoomId = keyof typeof headers;

export interface IndexRoomMeta {
  /** The photo's width over its height. */
  aspect: number;
  /** The slots left to right, as percentages of the photo. */
  slots: { left: number; top: number; width: number; height: number }[];
}

export const indexRoom = (room: IndexRoomId): IndexRoomMeta => headers[room];

/** How many slots (sleeves, posters) a header photo has. */
export const indexRoomSlots = (room: IndexRoomId) => headers[room].slots.length;

/** A slot's on-screen width over its height. */
export function indexRoomSlotAspect(room: IndexRoomId, i = 0) {
  const s = headers[room].slots[i];
  return (s.width * headers[room].aspect) / s.height;
}
