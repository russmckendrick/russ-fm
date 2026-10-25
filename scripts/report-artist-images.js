#!/usr/bin/env node

/**
 * Which artist photos to replace: reads every
 * public/artist/<slug>/<slug>-image.json (written by generate-artist-images.js)
 * and lists the photos that don't suit the artist hero, most-collected artists
 * first, so the pages people see most get new photos first.
 *
 *   no-photo     no -hi-res.jpg at all (the scrapper found none)
 *   tiny         shorter side under 500px: visibly soft at any size
 *   low          shorter side under 800px: soft in the ~700px desktop hero on a retina screen
 *   no-person    Vision found nobody: the hero is placed by the subject alone
 *   mono         black and white (chroma under 0.06)
 *   faceless     no face found: the hero can't centre on anyone
 *   small-faces  largest face under 7% of the photo's height: people too small in frame
 *   dark-backdrop  (only with --all) a dark backdrop, which makes a dark flood;
 *                  there are hundreds, so it's opt-in
 *
 * Usage: node scripts/report-artist-images.js [--all] [--issue <name>] [--limit <n>] [--csv]
 *   --issue   only that issue (repeatable)
 *   --limit   artists listed per issue (default 20; 0 lists all)
 *   --all     also report dark-backdrop
 *   --csv     every flagged artist as CSV on stdout (slug,name,records,width,height,issues)
 *
 * After each group, and once at the end for everything listed, it prints the
 * generate-artist-images command for those artists, ready to paste once their
 * photos are replaced.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { ISSUES, collectionArtists } from './lib/artist-image-issues.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIST_DIR = path.join(ROOT, 'public', 'artist');

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const values = [];
  args.forEach((a, i) => a === flag && args[i + 1] && values.push(args[i + 1]));
  return values;
};
const asCsv = args.includes('--csv');
const all = args.includes('--all');
const only = valueOf('--issue');
const limit = Number(valueOf('--limit')[0] ?? 20);

const unknown = only.filter((name) => !ISSUES[name] && name !== 'no-photo');
if (unknown.length) {
  console.error(`Unknown issue: ${unknown.join(', ')}. One of: no-photo, ${Object.keys(ISSUES).join(', ')}`);
  process.exit(1);
}
const active = Object.entries(ISSUES).filter(([name, issue]) => (only.length ? only.includes(name) : all || !issue.optIn));

/** The generate command for some artists, ready to paste (slugs are quoted as one argument). */
const regenerate = (slugs) => `pnpm run generate-artist-images -- --only '${slugs.join(',')}'`;

async function main() {
  const artists = await collectionArtists(ROOT);
  const slugs = (await fs.readdir(ARTIST_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

  const rows = [];
  const exists = (file) => fs.access(file).then(() => true, () => false);
  const noPhoto = [];
  let unmeasured = 0;
  for (const slug of slugs) {
    let info;
    try {
      info = JSON.parse(await fs.readFile(path.join(ARTIST_DIR, slug, `${slug}-image.json`), 'utf8'));
    } catch {
      if (await exists(path.join(ARTIST_DIR, slug, `${slug}-hi-res.jpg`))) unmeasured++;
      else noPhoto.push(slug);
      continue;
    }
    const issues = active.filter(([, issue]) => issue.test(info)).map(([name]) => name);
    if (!issues.length) continue;
    const artist = artists.get(slug) ?? { name: slug, records: 0 };
    rows.push({ slug, name: artist.name, records: artist.records, width: info.width, height: info.height, issues });
  }
  if (!only.length || only.includes('no-photo')) {
    for (const slug of noPhoto) {
      const artist = artists.get(slug) ?? { name: slug, records: 0 };
      rows.push({ slug, name: artist.name, records: artist.records, width: 0, height: 0, issues: ['no-photo'] });
    }
  }
  rows.sort((a, b) => b.records - a.records || a.name.localeCompare(b.name));

  if (asCsv) {
    const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    console.log('slug,name,records,width,height,issues');
    for (const r of rows) console.log([r.slug, r.name, r.records, r.width, r.height, r.issues.join(' ')].map(cell).join(','));
    return;
  }

  console.log(chalk.bold(`\n🖼️  Artist photos to replace: ${rows.length} of ${slugs.length} flagged`) + chalk.dim(' (most-collected first)'));
  if (unmeasured) console.log(chalk.yellow(`   ${unmeasured} photos have no -image.json yet: run pnpm run generate-artist-images first`));

  const listedSlugs = new Set();
  for (const [name, issue] of [['no-photo', { label: 'No photo' }], ...active]) {
    const hits = rows.filter((r) => r.issues.includes(name));
    if (!hits.length) continue;
    const listed = limit > 0 ? hits.slice(0, limit) : hits;
    listed.forEach((r) => listedSlugs.add(r.slug));
    console.log(`\n${chalk.bold(issue.label)} ${chalk.dim(`· ${hits.length} · --issue ${name}`)}`);
    for (const r of listed) {
      const records = `${r.records} record${r.records === 1 ? '' : 's'}`.padEnd(11);
      const size = (r.width ? `${r.width}×${r.height}` : '—').padEnd(10);
      const others = r.issues.filter((i) => i !== name);
      console.log(`  ${chalk.dim(records)} ${size} ${r.name.padEnd(32)} ${chalk.dim(`/artist/${r.slug}/`)}${others.length ? chalk.yellow(`  also ${others.join(', ')}`) : ''}`);
    }
    if (limit > 0 && hits.length > limit) console.log(chalk.dim(`  …and ${hits.length - limit} more (--limit 0 lists all)`));
    console.log(chalk.dim('  Once replaced:'));
    console.log(`  ${regenerate(listed.map((r) => r.slug))}`);
  }
  if (listedSlugs.size) {
    console.log(chalk.bold('\nEverything listed, once replaced:'));
    console.log(`${regenerate([...listedSlugs])}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
