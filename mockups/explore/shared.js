// Shared helpers for the /explore prototypes. Plain ES module, no build step.
// Serve the repo with the Vite dev server so /album/... and /artist/... come
// from public/ (medium and avatar sizes are made on demand) and the atlases
// load same-origin for WebGL.

const DATA_URL = '/mockups/explore/data/explore.json';
let cache;

/** Load explore.json and add lookup tables. */
export async function loadExplore() {
  if (cache) return cache;
  const d = await fetch(DATA_URL).then(r => r.json());
  d.artistBySlug = new Map(d.artists.map((a, i) => [a.slug, i]));
  d.albumBySlug = new Map(d.albums.map((a, i) => [a.slug, i]));
  // artist index -> [{ other, why }]
  d.neighbours = d.artists.map(() => []);
  for (const l of d.links) {
    d.neighbours[l.a].push({ other: l.b, why: l.why });
    d.neighbours[l.b].push({ other: l.a, why: l.why });
  }
  // label / style / year -> [album index]
  d.byLabel = groupBy(d.albums, a => a.l);
  d.byStyle = groupBy(d.albums, a => a.s);
  d.byYear = groupBy(d.albums, a => (a.y ? [a.y] : []));
  d.byColour = groupBy(d.albums, a => (a.vc ? [a.vc] : []));
  cache = d;
  return d;
}

function groupBy(list, keys) {
  const m = new Map();
  list.forEach((item, i) => {
    for (const k of keys(item)) {
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
  });
  return m;
}

/** Sleeve image. size: 'medium' (800px) or 'hi-res' (1400px). */
export const sleeveUrl = (album, size = 'medium') => `/album/${album.slug}/${album.slug}-${size}.jpg`;

/** Artist photo. size: 'medium', 'hi-res' or 'avatar'. */
export const artistUrl = (artist, size = 'medium') => `/artist/${artist.slug}/${artist.slug}-${size}.jpg`;

/** 1280x720 TheAudioDB fanart, n from artist.fanart (1-4). */
export const fanartUrl = (artist, n = artist.fanart[0]) => `/artist/${artist.slug}/${artist.slug}-fanart0${n}.jpg`;

/** Album and artist pages on the live site. */
export const albumHref = album => `https://russ.fm/album/${album.slug}/`;
export const artistHref = artist => `https://russ.fm/artist/${artist.slug}/`;

/** YouTube thumbnail and a muted, looping, chrome-free embed. */
export const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytEmbed = (id, { start = 30, mute = 1 } = {}) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${mute}&controls=0&loop=1&playlist=${id}&start=${start}&modestbranding=1&playsinline=1&rel=0`;

/**
 * Sleeve atlas cell for album index i. Sheets are data/sleeves-{sheet}.jpg,
 * cols x cols cells of `size` px. Returns UVs with v measured from the top.
 */
export function sleeveCell(d, i) {
  const { cols, sleeve } = d.atlas;
  const per = cols * cols;
  const sheet = Math.floor(i / per);
  const n = i % per;
  return { sheet, x: (n % cols) * sleeve, y: Math.floor(n / cols) * sleeve, size: sleeve, u: (n % cols) / cols, v: Math.floor(n / cols) / cols, w: 1 / cols };
}
export const sleeveSheetUrl = sheet => `/mockups/explore/data/sleeves-${sheet}.jpg`;
export const sleeveSheetCount = d => Math.ceil(d.albums.length / (d.atlas.cols * d.atlas.cols));

/** Avatar atlas cell for artist index i (data/avatars.jpg). */
export function avatarCell(d, i) {
  const { avatarCols: cols, avatar: size } = d.atlas;
  const rows = Math.ceil(d.artists.length / cols);
  return { x: (i % cols) * size, y: Math.floor(i / cols) * size, size, u: (i % cols) / cols, v: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows };
}
export const avatarSheetUrl = '/mockups/explore/data/avatars.jpg';

/** A one-line, plain-English sentence for a link reason. */
export function describeLink(d, why, from, to) {
  const A = i => d.artists[i].name;
  switch (why.type) {
    case 'bandmate': return `${why.who} played in both ${A(from)} and ${A(to)}`;
    case 'member': return `${why.who} was a member of ${d.artists[d.artistBySlug.get(why.from)].name}`;
    case 'group': return `${d.artists[d.artistBySlug.get(why.from)].name} was in ${why.who}`;
    case 'alias': return `${A(from)} and ${A(to)} are the same act under another name`;
    case 'guest': return `${A(why.guest)} guests on "${why.track}" from ${d.albums[why.album].t}`;
    default: return '';
  }
}

export const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/** Prototype switcher bar. Call once per page with the current key. */
export function mountNav(current) {
  const items = [
    ['thread', 'The Thread'],
    ['galaxy', 'The Galaxy'],
    ['wall', 'The Wall'],
    ['trees', 'Family Trees'],
    ['aisle', 'The Aisle'],
  ];
  const nav = document.createElement('nav');
  nav.className = 'x-nav';
  nav.innerHTML = `<a class="x-nav-home" href="/mockups/explore/">Explore</a>` +
    items.map(([k, label]) => `<a href="/mockups/explore/${k}.html"${k === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  document.body.appendChild(nav);
}
