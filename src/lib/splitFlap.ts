/**
 * Layout for the Shuffle page's split-flap board: turns a record's artist,
 * title, year and genre into a flat list of tiles, one character per tile.
 */

export interface FlapLayout {
  /** Tiles per row. */
  cols: number;
  artistRows: number;
  titleRows: number;
}

export interface FlapRecord {
  artist: string;
  title: string;
  year: string;
  /** Genres in order of preference; the board shows the first that fits. */
  genres: string[];
}

/** Tiles the year takes at the start of the last row (plus one blank). */
export const YEAR_TILES = 4;

/** What a tile shows while it is still flipping. */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&';

export function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

/** Upper case, accents stripped, single spaces. */
export function flapText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function pad(cells: string[], cols: number): string[] {
  return [...cells, ...Array<string>(Math.max(0, cols - cells.length)).fill(' ')].slice(0, cols);
}

/**
 * Word-wrap text into `rows` rows of `cols` tiles, centred vertically. Words
 * longer than a row are split; text that runs past the last row ends in an
 * ellipsis.
 */
export function wrapToRows(text: string, cols: number, rows: number): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];

  for (const word of flapText(text).split(' ').filter(Boolean)) {
    let w = Array.from(word);
    while (w.length > cols) {
      if (line.length) {
        lines.push(line);
        line = [];
      }
      lines.push(w.slice(0, cols));
      w = w.slice(cols);
    }
    if (!line.length) line = w;
    else if (line.length + 1 + w.length <= cols) line = [...line, ' ', ...w];
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line.length) lines.push(line);

  let fitted = lines;
  if (lines.length > rows) {
    fitted = lines.slice(0, rows);
    const last = fitted[rows - 1].slice(0, cols - 1);
    while (last.length && last[last.length - 1] === ' ') last.pop();
    fitted[rows - 1] = [...last, '…'];
  }

  const top = Math.floor((rows - fitted.length) / 2);
  return Array.from({ length: rows }, (_, i) => pad(fitted[i - top] ?? [], cols));
}

/** Every tile on the board, row by row: artist rows, title rows, then year and genre. */
export function boardFor(record: FlapRecord, layout: FlapLayout): string[] {
  const { cols, artistRows, titleRows } = layout;
  const year = pad(Array.from(record.year).slice(0, YEAR_TILES), YEAR_TILES);
  const genreTiles = cols - YEAR_TILES - 1;
  const genreText = record.genres.find(g => flapText(g).length <= genreTiles) ?? record.genres[0] ?? '';
  const genre = wrapToRows(genreText, genreTiles, 1)[0];
  return [
    ...wrapToRows(record.artist, cols, artistRows).flat(),
    ...wrapToRows(record.title, cols, titleRows).flat(),
    ...year,
    ' ',
    ...genre,
  ];
}

/** An empty board for the given layout. */
export function blankBoard(layout: FlapLayout): string[] {
  return Array<string>(layout.cols * (layout.artistRows + layout.titleRows + 1)).fill(' ');
}
