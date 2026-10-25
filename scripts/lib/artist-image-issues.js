/**
 * What makes an artist photo a poor fit for the artist hero, judged from its
 * public/artist/<slug>/<slug>-image.json, and how many records each artist
 * page shows. Used by report-artist-images.js.
 */

import fs from 'fs/promises';
import path from 'path';

export const ISSUES = {
  tiny: { label: 'Tiny (under 500px)', test: (j) => Math.min(j.width, j.height) < 500 },
  low: { label: 'Low resolution (under 800px)', test: (j) => Math.min(j.width, j.height) >= 500 && Math.min(j.width, j.height) < 800 },
  'no-person': { label: 'No person found (placed by the subject alone)', test: (j) => !j.faces?.length && !j.people?.length },
  mono: { label: 'Black and white', test: (j) => j.chroma != null && j.chroma < 0.06 },
  faceless: { label: 'No face found (the hero can\'t centre on anyone)', test: (j) => !j.faces?.length },
  'small-faces': { label: 'Faces too small in frame', test: (j) => j.faces?.length > 0 && Math.max(...j.faces.map((f) => f[3])) < 0.07 },
  'dark-backdrop': { label: 'Dark backdrop (a dark flood)', test: (j) => j.backdrop?.tone === 'dark', optIn: true },
};

/** Records per artist page, and the artist's name, from the collection. */
export async function collectionArtists(root) {
  const collection = JSON.parse(await fs.readFile(path.join(root, 'public', 'collection.json'), 'utf8'));
  const artists = new Map();
  for (const album of collection) {
    const credited = album.artists?.length ? album.artists : [{ name: album.release_artist, uri_artist: album.uri_artist }];
    for (const { name, uri_artist: uri } of credited) {
      const slug = uri?.split('/').filter(Boolean).pop();
      if (!slug) continue;
      const entry = artists.get(slug) ?? { name, records: 0 };
      entry.records++;
      artists.set(slug, entry);
    }
  }
  return artists;
}
