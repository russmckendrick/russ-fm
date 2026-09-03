#!/usr/bin/env node

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE_URL = (process.env.SITE_URL || 'https://russ.fm').replace(/\/+$/, '');
const ASSETS_BASE_URL = (process.env.ASSETS_BASE_URL || 'https://assets.russ.fm').replace(/\/+$/, '');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
// Artists with no OG card (scripts/og-skip.json) fall back to the site-wide image.
const OG_SKIPPED_ARTISTS = new Set(
  JSON.parse(await readFile(path.join(process.cwd(), 'scripts', 'og-skip.json'), 'utf8')).artists ?? []
);
const COLLECTION_PATH = path.join(PUBLIC_DIR, 'collection.json');
const WRAPPED_DIR = path.join(PUBLIC_DIR, 'wrapped');

const META_START = '<!-- META:START';
const META_END = '<!-- META:END -->';

async function main() {
  const targets = await resolveTargets(process.argv.slice(2));
  if (targets.length === 0) {
    console.log('generate-static-meta: no target build directory found (looked for dist, dist-worker)');
    return;
  }

  const collection = JSON.parse(await readFile(COLLECTION_PATH, 'utf8'));

  let totalAlbums = 0;
  let totalArtists = 0;
  let totalHubs = 0;
  let totalWrapped = 0;
  let totalSkipped = 0;

  for (const target of targets) {
    const templatePath = path.join(target, 'index.html');
    let template;
    try {
      template = await readFile(templatePath, 'utf8');
    } catch {
      console.log(`generate-static-meta: skipping ${target} (no index.html)`);
      continue;
    }

    if (!template.includes(META_START) || !template.includes(META_END)) {
      console.warn(`generate-static-meta: ${target}/index.html missing META markers — skipping`);
      continue;
    }

    let albumCount = 0;
    let artistCount = 0;
    let skipped = 0;

    for (const album of collection) {
      const slug = pathToSlug(album.uri_release);
      if (!slug) { skipped++; continue; }
      const detail = await readJsonOrNull(path.join(PUBLIC_DIR, 'album', slug, `${slug}.json`));
      const head = buildAlbumHead({ album, detail, slug });
      const html = injectHead(template, head);
      await writeRouteHtml(target, 'album', slug, html);
      albumCount++;
    }

    const artistMap = buildArtistMap(collection);
    for (const [slug, info] of artistMap) {
      const detail = await readJsonOrNull(path.join(PUBLIC_DIR, 'artist', slug, `${slug}.json`));
      const head = buildArtistHead({ slug, info, detail });
      const html = injectHead(template, head);
      await writeRouteHtml(target, 'artist', slug, html);
      artistCount++;
    }

    let hubCount = 0;
    const facetGroups = buildFacetGroups(collection);
    for (const [facetKey, slugMap] of Object.entries(facetGroups)) {
      const singular = facetSingular(facetKey);
      for (const [slug, group] of slugMap) {
        const head = buildFacetHead({ facetKey, singular, slug, group });
        const html = injectHead(template, head);
        await writeRouteHtml(target, singular, slug, html);
        hubCount++;
      }
    }

    let wrappedCount = 0;
    for (const yearMeta of await listWrappedYears()) {
      const head = buildWrappedHead(yearMeta);
      const html = injectHead(template, head);
      await writeRouteHtml(target, 'wrapped', String(yearMeta.year), html);
      wrappedCount++;
    }

    console.log(
      `generate-static-meta: ${path.relative(process.cwd(), target)} — ${albumCount} album pages, ${artistCount} artist pages, ${hubCount} hub pages, ${wrappedCount} wrapped pages` +
      (skipped ? `, ${skipped} skipped` : '')
    );

    totalAlbums += albumCount;
    totalArtists += artistCount;
    totalHubs += hubCount;
    totalWrapped += wrappedCount;
    totalSkipped += skipped;
  }

  console.log(
    `generate-static-meta: complete (${totalAlbums} albums, ${totalArtists} artists, ${totalHubs} hubs, ${totalWrapped} wrapped` +
    (totalSkipped ? `, ${totalSkipped} skipped` : '') + ')'
  );
}

async function resolveTargets(args) {
  const explicit = args.filter((a) => !a.startsWith('--'));
  if (explicit.length > 0) {
    const resolved = [];
    for (const dir of explicit) {
      const abs = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
      if (await directoryExists(abs)) resolved.push(abs);
    }
    return resolved;
  }
  const candidates = ['dist', 'dist-worker'].map((d) => path.join(process.cwd(), d));
  const resolved = [];
  for (const dir of candidates) {
    if (await directoryExists(dir)) resolved.push(dir);
  }
  return resolved;
}

async function directoryExists(dir) {
  try { await access(dir); return true; } catch { return false; }
}

async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function pathToSlug(uri) {
  if (typeof uri !== 'string') return null;
  const match = uri.match(/^\/(?:album|artist)\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

function buildArtistMap(collection) {
  const map = new Map();
  for (const album of collection) {
    const albumArtists = Array.isArray(album.artists) && album.artists.length > 0
      ? album.artists
      : [{ name: album.release_artist, uri_artist: album.uri_artist }];
    for (const artist of albumArtists) {
      const slug = pathToSlug(artist?.uri_artist || '');
      if (!slug || slug === 'various') continue;
      if ((artist?.name || '').trim().toLowerCase() === 'various') continue;
      const current = map.get(slug);
      if (current) {
        current.albumCount++;
      } else {
        map.set(slug, { name: artist.name, albumCount: 1 });
      }
    }
  }
  return map;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForScript(value) {
  return value.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function trim(text, max) {
  if (!text) return '';
  const flat = String(text).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + '…';
}

function albumDescription({ album, detail }) {
  const title = detail?.title || album.release_name;
  const artist = album.release_artist;
  const year = parseYear(detail?.year || album.date_release_year);
  const perplexity = detail?.services?.perplexity?.description;
  if (perplexity) {
    return trim(`${title} by ${artist} (${year}). ${perplexity}`, 300);
  }
  const genres = (album.genre_names || detail?.genres || []).slice(0, 3).filter(Boolean).join(', ');
  const labels = (album.labels || detail?.labels || []).slice(0, 2).filter(Boolean).join(', ');
  const parts = [`${title} by ${artist}`];
  if (year) parts.push(`released ${year}`);
  if (genres) parts.push(genres);
  if (labels) parts.push(`on ${labels}`);
  return trim(parts.join(' · ') + '.', 300);
}

function artistDescription({ info, detail }) {
  const name = detail?.name || info.name;
  const bio = detail?.biography;
  const albums = info.albumCount;
  const albumLine = `${albums} album${albums === 1 ? '' : 's'} in collection.`;
  if (bio) {
    return trim(`${name}. ${bio} ${albumLine}`, 300);
  }
  const genres = (detail?.genres || []).slice(0, 3).filter(Boolean).join(', ');
  const parts = [name];
  if (genres) parts.push(genres);
  parts.push(albumLine);
  return trim(parts.join(' · '), 300);
}

function parseYear(value) {
  if (!value) return null;
  if (typeof value === 'number' && value > 0) return value;
  const str = String(value);
  const match = str.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

function isoDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `PT${minutes}M${seconds}S`;
}

function buildAlbumJsonLd({ album, detail, slug, canonical, image, description }) {
  const title = detail?.title || album.release_name;
  const year = parseYear(detail?.year || album.date_release_year);
  const released = detail?.released || (year ? `${year}` : null);
  const genres = uniq([...(album.genre_names || []), ...(detail?.genres || []), ...(detail?.styles || [])]).filter(Boolean);
  const labels = (album.labels || detail?.labels || []).filter(Boolean);
  const formats = (album.formats || detail?.formats || []).filter(Boolean);
  const tracks = Array.isArray(detail?.tracklist) ? detail.tracklist : [];

  const primaryArtistName = album.release_artist;
  const primaryArtistSlug = pathToSlug(album.uri_artist || '') || pathToSlug(album.artists?.[0]?.uri_artist || '');

  const data = {
    '@context': 'https://schema.org',
    '@type': 'MusicAlbum',
    '@id': canonical,
    url: canonical,
    name: title,
    description,
    image,
    byArtist: primaryArtistSlug
      ? {
          '@type': 'MusicGroup',
          name: primaryArtistName,
          url: `${SITE_URL}/artist/${primaryArtistSlug}`,
        }
      : { '@type': 'MusicGroup', name: primaryArtistName },
  };

  if (released) data.datePublished = released;
  if (genres.length) data.genre = genres;
  if (labels.length) data.recordLabel = labels.map((name) => ({ '@type': 'Organization', name }));
  if (formats.length) data.albumReleaseType = formats[0];
  if (tracks.length) {
    data.numTracks = tracks.length;
    data.track = tracks.slice(0, 50).map((track, idx) => {
      const node = {
        '@type': 'MusicRecording',
        name: track.title || track.name || `Track ${idx + 1}`,
        position: track.position || track.track_number || idx + 1,
        byArtist: { '@type': 'MusicGroup', name: primaryArtistName },
      };
      const duration = isoDuration(track.duration_ms);
      if (duration) node.duration = duration;
      return node;
    });
  }
  if (detail?.discogs_url) data.sameAs = uniq([
    detail.discogs_url,
    detail.spotify_url,
    detail.apple_music_url,
    detail.lastfm_url,
  ].filter(Boolean));

  const breadcrumb = breadcrumbList([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Albums', url: `${SITE_URL}/albums` },
    { name: title },
  ]);

  return [data, breadcrumb];
}

function buildArtistJsonLd({ info, detail, slug, canonical, image, description }) {
  const name = detail?.name || info.name;
  const genres = uniq(detail?.genres || []).filter(Boolean);
  const sameAs = uniq([
    detail?.wikipedia_url,
    detail?.spotify_url || detail?.services?.spotify?.external_urls?.spotify,
    detail?.discogs_url,
    detail?.lastfm_url || detail?.services?.lastfm?.url,
    detail?.services?.apple_music?.url,
  ].filter(Boolean));

  const data = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    '@id': canonical,
    url: canonical,
    name,
    description,
    image,
  };
  if (genres.length) data.genre = genres;
  if (sameAs.length) data.sameAs = sameAs;
  if (detail?.country) data.foundingLocation = detail.country;
  if (detail?.formed_date) data.foundingDate = detail.formed_date;

  const breadcrumb = breadcrumbList([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Artists', url: `${SITE_URL}/artists` },
    { name },
  ]);

  return [data, breadcrumb];
}

function breadcrumbList(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => {
      const node = { '@type': 'ListItem', position: idx + 1, name: item.name };
      if (item.url) node.item = item.url;
      return node;
    }),
  };
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function buildAlbumHead({ album, detail, slug }) {
  const title = detail?.title || album.release_name;
  const artist = album.release_artist;
  const pageTitle = `${title} by ${artist} | Russ.fm`;
  const canonical = `${SITE_URL}/album/${slug}`;
  const image = `${ASSETS_BASE_URL}/album/${slug}/og-image.png`;
  const description = albumDescription({ album, detail });
  const jsonLd = buildAlbumJsonLd({ album, detail, slug, canonical, image, description });
  return renderHead({
    title: pageTitle,
    description,
    canonical,
    ogType: 'music.album',
    image,
    url: canonical,
    jsonLd,
  });
}

function buildArtistHead({ slug, info, detail }) {
  const name = detail?.name || info.name;
  const albums = info.albumCount;
  const pageTitle = `${name} discography — ${albums} album${albums === 1 ? '' : 's'} in collection | Russ.fm`;
  const canonical = `${SITE_URL}/artist/${slug}`;
  const image = OG_SKIPPED_ARTISTS.has(slug)
    ? `${SITE_URL}/og-image.png`
    : `${ASSETS_BASE_URL}/artist/${slug}/og-image.png`;
  const description = artistDescription({ info, detail });
  const jsonLd = buildArtistJsonLd({ info, detail, slug, canonical, image, description });
  return renderHead({
    title: pageTitle,
    description,
    canonical,
    ogType: 'music.musician',
    image,
    url: canonical,
    jsonLd,
  });
}

function renderHead({ title, description, canonical, ogType, image, url, jsonLd }) {
  const lines = [
    `<!-- META:START (generated ${new Date().toISOString()}) -->`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="${escapeHtml(ogType)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:url" content="${escapeHtml(url)}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<title>${escapeHtml(title)}</title>`,
  ];
  const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  for (const block of blocks) {
    lines.push(
      `<script type="application/ld+json" data-russfm-jsonld>${escapeJsonForScript(JSON.stringify(block))}</script>`,
    );
  }
  lines.push(META_END);
  return lines.join('\n    ');
}

function injectHead(template, head) {
  const startIdx = template.indexOf(META_START);
  const endIdx = template.indexOf(META_END);
  if (startIdx === -1 || endIdx === -1) return template;
  return template.slice(0, startIdx) + head + template.slice(endIdx + META_END.length);
}

async function writeRouteHtml(target, kind, slug, html) {
  const dir = path.join(target, kind, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function getDecade(rawYear) {
  const year = Number.parseInt(String(rawYear).slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1900) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

function facetSingular(key) {
  switch (key) {
    case 'genre': return 'genre';
    case 'label': return 'label';
    case 'decade': return 'decade';
    case 'country': return 'country';
    default: return key;
  }
}

function buildFacetGroups(collection) {
  const groups = {
    genre: new Map(),
    label: new Map(),
    decade: new Map(),
    country: new Map(),
  };

  function add(facet, rawName, album) {
    if (!rawName) return;
    const slug = slugify(rawName);
    if (!slug) return;
    const map = groups[facet];
    let group = map.get(slug);
    if (!group) {
      group = { displayName: rawName, albums: [], artists: new Map(), firstYear: Infinity, lastYear: 0 };
      map.set(slug, group);
    }
    group.albums.push(album);
    const albumArtists = album.artists?.length ? album.artists : [{ name: album.release_artist, uri_artist: album.uri_artist }];
    for (const artist of albumArtists) {
      const name = artist?.name;
      if (!name || name.toLowerCase() === 'various') continue;
      const uri = artist.uri_artist || '';
      const current = group.artists.get(uri || name);
      if (current) {
        current.count++;
      } else {
        group.artists.set(uri || name, { name, uri, count: 1 });
      }
    }
    const y = Number.parseInt(String(album.date_release_year).slice(0, 4), 10);
    if (Number.isFinite(y) && y >= 1900) {
      if (y < group.firstYear) group.firstYear = y;
      if (y > group.lastYear) group.lastYear = y;
    }
  }

  for (const album of collection) {
    const genres = new Set([
      ...(album.genre_names || []),
      ...(album.styles || []),
    ]);
    for (const genre of genres) add('genre', genre, album);

    for (const label of album.labels || []) add('label', label, album);

    if (album.country) add('country', album.country, album);

    const decade = getDecade(album.date_release_year);
    if (decade) add('decade', decade, album);
  }

  return groups;
}

function buildFacetIntro(facetKey, displayName, group) {
  const albumCount = group.albums.length;
  const artistCount = group.artists.size;
  const albumWord = albumCount === 1 ? 'album' : 'albums';
  const artistWord = artistCount === 1 ? 'artist' : 'artists';
  const range = group.lastYear > 0
    ? group.firstYear === group.lastYear
      ? `from ${group.firstYear}`
      : `spanning ${group.firstYear}–${group.lastYear}`
    : '';
  switch (facetKey) {
    case 'genre':
      return `${albumCount} ${displayName} ${albumWord} from ${artistCount} ${artistWord} in the russ.fm collection${range ? `, ${range}` : ''}.`;
    case 'label':
      return `${albumCount} ${albumWord} from ${displayName} in the collection, by ${artistCount} different ${artistWord}${range ? ` ${range}` : ''}.`;
    case 'decade':
      return `${albumCount} ${albumWord} released in ${displayName}, by ${artistCount} ${artistWord} in the russ.fm collection.`;
    case 'country':
      return `${albumCount} ${albumWord} pressed in ${displayName}, by ${artistCount} ${artistWord} in the collection${range ? `, ${range}` : ''}.`;
    default:
      return `${albumCount} ${albumWord} for ${displayName} in the collection.`;
  }
}

function facetTitle(facetKey, displayName) {
  switch (facetKey) {
    case 'genre': return `${displayName} albums in the collection | Russ.fm`;
    case 'label': return `${displayName} releases | Russ.fm`;
    case 'decade': return `The ${displayName.replace(/^The\s+/, '')} albums | Russ.fm`;
    case 'country': return `Albums from ${displayName} | Russ.fm`;
    default: return `${displayName} | Russ.fm`;
  }
}

function buildFacetHead({ facetKey, singular, slug, group }) {
  const displayNameRaw = group.displayName;
  const displayName = facetKey === 'decade' ? `The ${displayNameRaw}` : displayNameRaw;
  const intro = trim(buildFacetIntro(facetKey, displayName, group), 300);
  const canonical = `${SITE_URL}/${singular}/${slug}`;
  const title = facetTitle(facetKey, displayName);
  const image = `${SITE_URL}/og-image.png`;

  const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': canonical,
    url: canonical,
    name: title,
    description: intro,
  };
  const breadcrumb = breadcrumbList([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Browse', url: `${SITE_URL}/browse` },
    { name: displayName },
  ]);

  return renderHead({
    title,
    description: intro,
    canonical,
    ogType: 'website',
    image,
    url: canonical,
    jsonLd: [collectionPage, breadcrumb],
  });
}

async function listWrappedYears() {
  let entries = [];
  try {
    entries = await readdir(WRAPPED_DIR);
  } catch {
    return [];
  }
  const years = [];
  for (const entry of entries) {
    const match = entry.match(/^wrapped-(\d{4})\.json$/);
    if (match) years.push({ year: Number(match[1]) });
  }
  return years;
}

function buildWrappedHead({ year }) {
  const title = `${year} Wrapped — a year in records | Russ.fm`;
  const description = `${year} in the russ.fm collection: top albums, top artists, and listening highlights from the year.`;
  const canonical = `${SITE_URL}/wrapped/${year}`;
  const image = `${SITE_URL}/og-image.png`;
  const breadcrumb = breadcrumbList([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Wrapped', url: `${SITE_URL}/wrapped` },
    { name: String(year) },
  ]);
  return renderHead({
    title,
    description,
    canonical,
    ogType: 'website',
    image,
    url: canonical,
    jsonLd: [breadcrumb],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
