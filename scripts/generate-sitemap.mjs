#!/usr/bin/env node

import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE_URL = normalizeSiteUrl(
  process.env.SITEMAP_BASE_URL || process.env.SITE_URL || 'https://russ.fm',
);
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const COLLECTION_PATH = path.join(PUBLIC_DIR, 'collection.json');
const WRAPPED_DIR = path.join(PUBLIC_DIR, 'wrapped');
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'sitemap.xml');
const ALBUMS_PER_PAGE = 24;
const ARTISTS_PER_PAGE = 24;

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/albums', changefreq: 'weekly', priority: '0.9' },
  { path: '/artists', changefreq: 'weekly', priority: '0.9' },
  { path: '/stats', changefreq: 'weekly', priority: '0.7' },
  { path: '/genres', changefreq: 'weekly', priority: '0.7' },
  { path: '/browse', changefreq: 'weekly', priority: '0.7' },
  { path: '/labels', changefreq: 'weekly', priority: '0.7' },
  { path: '/decades', changefreq: 'weekly', priority: '0.7' },
  { path: '/countries', changefreq: 'weekly', priority: '0.7' },
  { path: '/random', changefreq: 'weekly', priority: '0.4' },
];

const routes = new Map();

async function main() {
  const collection = await readCollection();
  const collectionLastmod = maxDate(collection.map((album) => album.date_added)) || today();

  for (const route of STATIC_ROUTES) {
    addRoute(route.path, { ...route, lastmod: collectionLastmod });
  }

  addPaginatedRoutes('/albums', collection.length, ALBUMS_PER_PAGE, collectionLastmod);

  const artistLastmods = buildArtistLastmods(collection);
  addPaginatedRoutes('/artists', artistLastmods.size, ARTISTS_PER_PAGE, collectionLastmod);

  for (const album of collection) {
    addRoute(album.uri_release, {
      lastmod: album.date_added || collectionLastmod,
      changefreq: 'monthly',
      priority: '0.8',
    });
  }

  for (const [artistPath, lastmod] of artistLastmods) {
    addRoute(artistPath, {
      lastmod,
      changefreq: 'monthly',
      priority: '0.7',
    });
  }

  addFacetRoutes(collection, collectionLastmod);
  await addWrappedRoutes(collection, collectionLastmod);

  const xml = renderSitemap(Array.from(routes.values()));
  const writtenFiles = await writeSitemap(xml);

  console.log(`Generated ${writtenFiles.join(', ')} with ${routes.size} URLs`);
}

async function readCollection() {
  const raw = await readFile(COLLECTION_PATH, 'utf8');
  const collection = JSON.parse(raw);
  if (!Array.isArray(collection)) {
    throw new Error(`${path.relative(process.cwd(), COLLECTION_PATH)} must contain an album array`);
  }
  return collection;
}

function addPaginatedRoutes(basePath, itemCount, itemsPerPage, lastmod) {
  const totalPages = Math.ceil(itemCount / itemsPerPage);
  for (let page = 2; page <= totalPages; page += 1) {
    addRoute(`${basePath}/${page}`, {
      lastmod,
      changefreq: 'weekly',
      priority: '0.5',
    });
  }
}

function buildArtistLastmods(collection) {
  const artists = new Map();

  for (const album of collection) {
    const albumArtists = Array.isArray(album.artists) && album.artists.length > 0
      ? album.artists
      : [{ name: album.release_artist, uri_artist: album.uri_artist }];

    for (const artist of albumArtists) {
      const routePath = normalizeRoutePath(artist?.uri_artist);
      if (!routePath || routePath === '/artist/various') continue;
      if ((artist?.name || '').trim().toLowerCase() === 'various') continue;

      const lastmod = normalizeDate(album.date_added);
      const current = artists.get(routePath);
      if (!current || (lastmod && lastmod > current)) {
        artists.set(routePath, lastmod);
      }
    }
  }

  return artists;
}

function addFacetRoutes(collection, fallbackLastmod) {
  const facetLastmods = {
    label: new Map(),
    decade: new Map(),
    country: new Map(),
    genre: new Map(),
  };

  for (const album of collection) {
    for (const label of album.labels || []) {
      addFacetValue(facetLastmods.label, label, album.date_added);
    }

    if (album.country) {
      addFacetValue(facetLastmods.country, album.country, album.date_added);
    }

    const decade = getDecade(album.date_release_year);
    if (decade) {
      addFacetValue(facetLastmods.decade, decade, album.date_added);
    }

    const genres = new Set([
      ...(album.genre_names || []),
      ...(album.styles || []),
    ]);
    for (const genre of genres) {
      addFacetValue(facetLastmods.genre, genre, album.date_added);
    }
  }

  for (const [slug, { lastmod }] of facetLastmods.label) {
    addRoute(`/label/${slug}`, { lastmod: lastmod || fallbackLastmod, changefreq: 'weekly', priority: '0.6' });
  }

  for (const [slug, { lastmod }] of facetLastmods.decade) {
    addRoute(`/decade/${slug}`, { lastmod: lastmod || fallbackLastmod, changefreq: 'weekly', priority: '0.6' });
  }

  for (const [slug, { lastmod }] of facetLastmods.country) {
    addRoute(`/country/${slug}`, { lastmod: lastmod || fallbackLastmod, changefreq: 'weekly', priority: '0.6' });
  }

  for (const [slug, { lastmod }] of facetLastmods.genre) {
    addRoute(`/genre/${slug}`, { lastmod: lastmod || fallbackLastmod, changefreq: 'weekly', priority: '0.7' });
  }
}

function addFacetValue(facetMap, value, rawLastmod) {
  const slug = slugify(value);
  if (!slug) return;

  const lastmod = normalizeDate(rawLastmod);
  const current = facetMap.get(slug);
  if (!current || (lastmod && lastmod > current.lastmod)) {
    facetMap.set(slug, { name: value, lastmod });
  }
}

async function addWrappedRoutes(collection, fallbackLastmod) {
  let files = [];
  try {
    files = await readdir(WRAPPED_DIR);
  } catch {
    return;
  }

  const yearLastmods = buildYearLastmods(collection);

  for (const file of files) {
    const yearMatch = file.match(/^wrapped-(\d{4})\.json$/);
    if (yearMatch) {
      const year = yearMatch[1];
      addRoute(`/wrapped/${year}`, {
        lastmod: yearLastmods.get(year) || fallbackLastmod,
        changefreq: 'monthly',
        priority: '0.6',
      });
      continue;
    }

    if (file === 'wrapped-ytd.json') {
      const year = await readWrappedYtdYear();
      if (year) {
        addRoute(`/wrapped/${year}`, {
          lastmod: yearLastmods.get(String(year)) || fallbackLastmod,
          changefreq: 'weekly',
          priority: '0.6',
        });
      }
    }
  }
}

async function readWrappedYtdYear() {
  try {
    const raw = await readFile(path.join(WRAPPED_DIR, 'wrapped-ytd.json'), 'utf8');
    const data = JSON.parse(raw);
    return Number.isInteger(data.year) ? data.year : null;
  } catch {
    return null;
  }
}

function buildYearLastmods(collection) {
  const years = new Map();
  for (const album of collection) {
    const year = normalizeDate(album.date_added)?.slice(0, 4);
    const lastmod = normalizeDate(album.date_added);
    if (!year || !lastmod) continue;

    const current = years.get(year);
    if (!current || lastmod > current) {
      years.set(year, lastmod);
    }
  }
  return years;
}

function addRoute(routePath, options = {}) {
  const normalizedPath = normalizeRoutePath(routePath);
  if (!normalizedPath) return;

  const next = {
    path: normalizedPath,
    lastmod: normalizeDate(options.lastmod) || today(),
    changefreq: options.changefreq,
    priority: options.priority,
  };

  const current = routes.get(normalizedPath);
  if (!current) {
    routes.set(normalizedPath, next);
    return;
  }

  const currentPriority = Number.parseFloat(current.priority || '0');
  const nextPriority = Number.parseFloat(next.priority || '0');
  if (next.lastmod > current.lastmod || nextPriority > currentPriority) {
    routes.set(normalizedPath, { ...current, ...next });
  }
}

function normalizeRoutePath(routePath) {
  if (typeof routePath !== 'string' || routePath.trim() === '') return null;
  const trimmed = routePath.trim();
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

function normalizeSiteUrl(siteUrl) {
  return siteUrl.replace(/\/+$/, '') || 'https://russ.fm';
}

function normalizeDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : `${match[1]}-${match[2]}-${match[3]}`;
}

function maxDate(values) {
  return values.map(normalizeDate).filter(Boolean).sort().at(-1) || null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getDecade(rawYear) {
  const year = Number.parseInt(String(rawYear).slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1900) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function renderSitemap(routeEntries) {
  const urls = routeEntries.map((route) => {
    const parts = [
      '  <url>',
      `    <loc>${escapeXml(new URL(route.path, SITE_URL).href)}</loc>`,
      `    <lastmod>${route.lastmod}</lastmod>`,
    ];

    if (route.changefreq) {
      parts.push(`    <changefreq>${route.changefreq}</changefreq>`);
    }

    if (route.priority) {
      parts.push(`    <priority>${route.priority}</priority>`);
    }

    parts.push('  </url>');
    return parts.join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

async function writeSitemap(xml) {
  const outputPaths = [OUTPUT_PATH];

  for (const dir of ['dist', 'dist-worker']) {
    const outputDir = path.join(process.cwd(), dir);
    if (await directoryExists(outputDir)) {
      outputPaths.push(path.join(outputDir, 'sitemap.xml'));
    }
  }

  await Promise.all(outputPaths.map((outputPath) => writeFile(outputPath, xml)));
  return outputPaths.map((outputPath) => path.relative(process.cwd(), outputPath));
}

async function directoryExists(dir) {
  try {
    await access(dir);
    return true;
  } catch {
    return false;
  }
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
