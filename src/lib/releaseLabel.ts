/** Text layout for the album page's centre-label release details (components/album/ReleaseLabel). */

/** Splits a title over up to three lines of similar length. */
export function titleLines(title: string): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const n = Math.min(3, Math.max(1, Math.ceil(title.length / 24)), words.length);
  if (n <= 1) return [title];
  const target = title.length / n;
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    // Break before a word that would carry the line well past its share, keeping the last line for the rest.
    if (line && lines.length < n - 1 && next.length > target + word.length / 2) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

/** Discogs's label list as printed: each name once, without its "(2)" disambiguation. */
export function labelNames(labels: string[]): string[] {
  return [...new Set(labels.map(l => l.replace(/\s*\(\d+\)$/, '').trim()).filter(Boolean))];
}
