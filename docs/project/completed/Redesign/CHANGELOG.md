# Redesign Changelog

Append-only log of what ships in each phase of the editorial vinyl-catalogue
redesign. Each entry records the files touched, the user-visible change, and
(once available) before/after screenshots.

Ordered newest first.

---

## Phase 12 — Accessibility, responsive polish, docs

**Date:** 2026-04-18
**User-visible change:** none — this phase is the close-out audit.

**Contrast.** Computed WCAG ratios for the paper/ink palette on
both themes:

| Role | Light | Dark | Notes |
|------|-------|------|-------|
| `ink` on paper | 17.22 | 17.33 | AAA — display titles, body |
| `ink-2` on paper | 13.16 | 13.08 | AAA — body copy |
| `ink-3` on paper | 6.72 | 6.35 | AA+ — secondary / sublines |
| `ink-dim` on paper | 3.33 | 3.29 | Decorative mono labels only — each sits next to a non-decorative grot sibling (pattern enforced across `SectionHeader`, `BrowseHeader`, `KpiTile`, cover hover strip). |
| `hl` on paper | 3.82 | 4.54 | Accent glyphs + kickers only. |

**Focus affordances.** Audited every `outline-none` / `focus:outline-none`
occurrence — all shadcn UI primitives compensate with
`focus-visible:ring-*`. The three bare inputs (`FilterBar`,
`ArtistsPage` search, `MobileSearchModal` search) now live inside
parent labels that add `focus-within:border-ink` / `focus-within:text-ink`
so keyboard focus remains visible. `index.css` keeps a scoped
`a:focus:not(:focus-visible) { outline: none }` rule so link
outlines only appear for keyboard users.

**Responsive.** Drag-scroll walls already use pointer events (touch
works). Hover-reveal on `AlbumCard` becomes a tap-reveal on touch
(`:hover` is simulated). Mobile nav + mobile search modal
preserved; MobileSearchModal's swipe-down-to-close, back-button
handling, and iOS focus workaround all still fire.

**Motion.** `prefers-reduced-motion: no-preference` drives the
tint cross-fade on `/random` and the home hero's carousel fade;
`motion-reduce:transition-none` kills both for reduced-motion
users. No other page has performative motion — the rest is "short,
functional" CSS transitions (hover colour shifts, chevron slides),
which stay enabled.

**Docs.** Updated:
- `docs/frontend/README.md` — notes the editorial redesign,
  `TweaksPanel` keybind, and the new file layout
  (`components/layout/`, `components/browse/`,
  `config/redesign.config.ts`, `styles/design-tokens.css`).
- `docs/frontend/components.md` — new "Editorial primitives"
  table listing `PageContainer`, `SectionHeader`, `DragWall`,
  `BrowseHeader`, `AlbumCard`, `ArtistCard`, `TweaksPanel`,
  `SearchOverlay`.
- `docs/frontend/pages.md` — per-page editorial structure table
  spanning Home / Albums / Artists / Album detail / Artist detail
  / Stats / Random / Search / Wrapped; notes GenrePage left as-is.

**Final state**
- 12 numbered phases shipped (including carry-over work in Phase 9
  adding per-month drag walls in Wrapped and Phase 10's follow-up
  making the search overlay a nav-anchored dropdown).
- Recharts, framer-motion on non-Wrapped pages, Kalam handwriting,
  and the pastel card/avatar shadcn surface all removed.
- `redesignConfig` wires all the tweakable counts (hero, walls,
  tiles, stats, random, tint defaults, density, mono, theme).
- Dev-only `TweaksPanel` available behind `Cmd/Ctrl+Shift+D`;
  public site locked to `redesignConfig` defaults.
- CHANGELOG + NOTES kept under `docs/project/Redesign/` for
  ongoing reference.

---

## Phase 11 — TweaksPanel (dev-only) + interaction polish

**Date:** 2026-04-18
**User-visible change:** none for end users — the public site still
ships with the `redesignConfig` defaults locked in. For the author,
a new dev-only `TweaksPanel` opens with `Cmd+Shift+D` (mac) or
`Ctrl+Shift+D` (others) and lets four knobs be tuned in place:

- **Density** — `sparse | medium | dense`, applies a
  `--tweak-density-scale` CSS variable and a `density-*` class on
  `<html>`. Hook-up points intentionally light for now so the knob
  doesn't clobber the editorial rhythm; it's available for future
  padding/line-height adjustments.
- **Mono labels** — toggles `mono-off` on `<html>`; CSS fades
  decorative mono kicker labels (`.uppercase.tracking-[…]`) to 35%
  so the page reads as grot + imagery only.
- **Cover colour** — toggles `tint-off` on `<html>`; the tinted
  drop-shadows on Album/Artist cards and hero wraps collapse to a
  neutral paper drop-shadow without touching component code.
- **Tint intensity** — 0–1 slider writes `--tint-strength` on
  `<html>`; hero washes that reference the variable update live.

State persists to `localStorage['russfm.tweaks']`; a reset button
clears storage and reverts to defaults. Panel is hidden from the
nav entirely — the only way in is the keyboard shortcut. `Esc`
closes.

**New files**
- `src/components/TweaksPanel.tsx` — 320px fixed bottom-right
  surface with inline `SegControl`, `Toggle`, `Slider` helpers.
- `src/hooks/useTweaks.ts` — singleton-ish hook that loads from
  localStorage, applies classes/CSS vars to `<html>`, persists on
  change, and exposes `reset()`.

**Changed files**
- `src/styles/design-tokens.css` — new section appended with the
  density / mono / tint rules.
- `src/App.tsx` — mounts `<TweaksPanel />` once at the root so the
  keyboard shortcut works from every page.

**Interaction polish already landed earlier**
- Random page tint crossfade uses
  `motion-reduce:transition-none` (Phase 8).
- DragWall no longer uses `setPointerCapture`, preserving child
  click navigation (Phase 4).
- Search overlay closes on `Esc` and click-outside
  (Phase 10 follow-up).

**Verified**
- `pnpm exec tsc --noEmit` clean.
- `Cmd+Shift+D` opens the panel (confirmed via dispatched
  KeyboardEvent with `metaKey + shiftKey`). Panel renders at
  320×?px fixed bottom-right, all 4 controls present, tint
  intensity reads `0.85` by default.
- Clicking `Dense` flips `<html>` from `density-medium` to
  `density-dense` and writes
  `{"density":"dense","monoLabels":true,"coverColor":true,"tintStrength":0.85}`
  to localStorage.
- Reset button clears storage (`null` after click) and reverts
  classes.

---

## Phase 10 — Search (overlay, mobile modal, results page)

**Date:** 2026-04-18
**User-visible change:** the three search surfaces are unified
around an editorial list. Results are segregated into `Albums`
and `Artists` groups under mono kicker headers, each row is a
hairline-separated strip of `THUMB · TITLE · YEAR · SUBTITLE`,
artists get circular thumbs with a user glyph, albums get square
thumbs with a disc glyph. The shared `SearchResults` component
accepts a `compact` layout for the overlay drop-down so rows sit
tight against the chrome.

**Desktop overlay (`/` or focus on the nav input)** — opens a
paper-shell drop-down below the sticky nav: hairline-bordered
wrapper, mono status strip (`N matches for "query"` / `Indexing
collection…` / `Start typing to search`), `Enter`+`Esc` kbd hints,
and a `View all →` crimson link when the query has matches. Esc
closes.

**Mobile modal** — re-skinned to the paper/ink palette; sharp
corners, hairline-bordered close button and input, mono
placeholder. Swipe-down-to-close, back-button handling, iOS
auto-focus workaround, and `overscroll-contain` all preserved.

**Results page (`/search?q=...`)** — uses the shared
`BrowseHeader` (kicker / title / subtitle / mono counts strip
showing `Query / Results / Albums / Artists`) on top of the
editorial list. No pagination — Fuse limit stays at 100 per call.

**Changed files**
- `src/components/SearchResults.tsx` — full rewrite into the
  segregated editorial list; `layout` prop now accepts
  `'grid' | 'list' | 'compact'` (old grid/list callers still
  work, they just get the new style). Drops the shadcn `Card`
  wrapper, `Avatar`, and `Badge` dependencies.
- `src/components/SearchOverlay.tsx` — rewrite. New status
  strip, kbd hints, editorial chrome. Esc-to-close hook added.
  Viewport clipped by `top: 72px` to sit under the sticky nav.
- `src/components/MobileSearchModal.tsx` — shell restyled to
  paper/ink; input is now a hairline label-wrapped text field
  instead of the shadcn rounded pill. Interaction and focus
  mechanics unchanged.
- `src/pages/SearchResultsPage.tsx` — rewrite using
  `PageContainer` + `BrowseHeader` + the shared `SearchResults`.
  Drops shadcn `Card` / `Avatar` / `Badge` and the inline result
  rendering. Search hook plumbing (`useManualSearch`) unchanged.

**Preserved (verified)**
- Fuse.js scoring layer unchanged.
- `/search?q=...` query-string deep linking preserved.
- `/` key focus in nav (from Phase 2) still opens the overlay.
- Mobile swipe-down, Android back-button, iOS focus workaround
  still present in the modal.

**Verified**
- `pnpm exec tsc --noEmit` clean.
- `/search?q=pavement` renders the editorial results page: 1
  BrowseHeader, two groups (`Albums 004` / `Artists 001`), 5 rows
  total, first row links to `/album/penthouse-and-pavement-9929529/`.
- Nav `input[placeholder*="Search records"]` onFocus triggers the
  overlay; typing `pixies` populates 2 groups and 10 rows inside
  the drop-down; overlay is `display:block` at md+ widths and
  sits under the sticky nav.

---

## Phase 9 — Wrapped (year + YTD dossier)

**Date:** 2026-04-18
**User-visible change:** `/wrapped/:year` now opens in a new
editorial dossier view by default. The old bento-grid is retired
as the default; the full-screen `WrappedPresentation` flow is
preserved behind a `Presentation` toggle in the page chrome. Year
selector and prev/next pagination still work.

The dossier runs through six numbered sections: giant `YYYY` word
treatment as the hero (clamp between 72px and 220px), then a
4-wide KPI strip (`RECORDS / ARTISTS / AVG-PER-MONTH / TOP GENRE`),
then `Album of the year` (sleeve + mono date crumb + display title +
prose), `Top 10` as a hairline-ruled catalogue list with tiny cover
thumbs and mono positions, `New rotation · Top artists` as a grid
of circular-portrait tiles with release-count progress bars,
`Genres in rotation` + `Decade spread` side by side, and a
`Monthly journey` that opens with a 12-bar at-a-glance summary
(peak month picked out in crimson) and then expands into one
`DragWall` per month — the same horizontal drag-scroll strip used
by the home page's Recently Added wall, one per calendar month,
populated with the actual releases that landed that month.
Prev/next year pagination lives in the footer.

YTD renders the same shape with a mono `YEAR TO DATE` kicker crumb
and a "on pace for N records by year end" subtitle pulling the
projected total from `summary.projectedTotal`.

**Preserved (not redesigned)**
- `WrappedPresentation.tsx` — the full-screen snap-scroll
  Spotify-style experience is untouched; still reachable via the
  `Presentation` toggle and still honours all its keyboard nav /
  auto-advance behaviour.
- Data loading: still reads `/wrapped/wrapped-{year}.json` and
  `/wrapped/wrapped-ytd.json` unchanged.
- `YearSelector` dropdown still used at the top-right.

**Changed files**
- `src/pages/wrapped/WrappedYear.tsx` — full rewrite. Drops
  `DynamicBentoGrid`, `SkeletonBentoGrid`, `YearPagination` (the
  grid-view version), and `PageTransition` imports. New inline
  `KpiTile` + `MonthlyTimeline` components; default `viewMode`
  now `'grid'` (editorial) instead of `'presentation'`.

**Verified**
- `pnpm exec tsc --noEmit` clean.
- `/wrapped/2025` renders the dossier: hero h1 `2025`, KPI strip
  reads `242 / 185 / 20.2 / Rock`, 6 top-album rows, 12 monthly
  bars, Presentation button present.
- YTD detection still fires (`data.isYearToDate`) — subtitle and
  kicker show the YEAR TO DATE affordance when current year.

---

## Phase 8 — Random page

**Date:** 2026-04-18
**User-visible change:** `/random` is rebuilt as an editorial
shuffle surface. The tinted hero wash picks up the current sleeve's
dominant colour and cross-fades over ~700ms whenever the record
changes; the sleeve sits left, display title + artist + KV strip +
chip row + action pair (`Shuffle` / `Open record`) sit right. Below
the hero a `Coming up in the crate` peek strip shows eight
upcoming possibilities; clicking any tile jumps directly to that
record.

**Interactions.** Space bar on desktop shuffles (ignoring inputs
and content-editable targets). The shuffle animation respects
`prefers-reduced-motion` via `motion-reduce:transition-none` on
both the wash and the fade. Shuffle button switches to a spinning
refresh glyph while a new tint loads.

**Queue model.** Instead of repeatedly calling
`Math.random()` on the full collection, the page now keeps a
shuffled queue. Current record lives at `queue[0]`; peek tiles come
from `queue[1..peekCount]`. Advancing pulls the next record to the
head; when the tail runs low a fresh deck is shuffled in behind it
so the peek strip never empties.

**Changed files**
- `src/pages/RandomPage.tsx` — full rewrite. Drops framer-motion,
  `createHeroBackground` / `createGlowGradient` / `generateColorProperties`,
  the vinyl-peeking-out glow, and the rotating hero shell. New
  editorial hero + peek strip, plus queue-based shuffle logic and a
  motion-reduce-aware transition. Peek count wired to
  `redesignConfig.random.peekCount`.

**Verified**
- `pnpm exec tsc --noEmit` clean.
- `/random` renders hero with a random sleeve and eight peek
  tiles; clicking a peek tile advances to that record.
- Shuffle button flips to a new record and the tint crossfades.
- Space key shuffles (behaviour confirmed via dispatched
  KeyboardEvent — `h1` swaps within one settle cycle).

---

## Phase 7 — Stats page

**Date:** 2026-04-18
**User-visible change:** `/stats` is rebuilt as an editorial dossier.
A single-column spread runs through twelve numbered blocks: hero
kicker + display title → 4-wide KPI strip (total albums / artists /
genres / avg per artist) → decade bars + genre donut → golden year
+ top 5 years → most-held artists grid → artist depth trio
(one-shots / catalogue / busiest month) → recent additions wall →
additions-over-time histogram → from-the-crates + random roster.

**Charts rebuilt as hand-rolled SVG.** The old Recharts `BarChart`
and `PieChart` are gone; decade histogram, top-years bars, and the
monthly additions strip are all plain inline SVG/flex markup. The
top-genres donut is a paper-stroked ring of eight graduated
ink-shade segments with a mono legend (`% / count`). Everything
respects the paper/ink palette and sharp corners.

**Counts wired to `redesignConfig.stats.*`.** The page no longer
hard-codes `.slice(0, 8)` / `.slice(0, 10)` for the grids —
`topArtistsCount`, `topYearsCount`, `recentAdditionsCount`,
`fromTheCratesCount`, `randomArtistsCount`, and
`decadeBarsMaxDecades` all drive the numbers.

**Changed files**
- `src/pages/StatsPage.tsx` — full rewrite. Drops `recharts`,
  `framer-motion`, `@/components/CollectionStats`,
  `@/components/ui/card`, per-chart album-colour random tinting, and
  the 3-album rotating hero stack. `calculateStats` logic preserved
  verbatim (top artists, decade / additions / year counts, one-hit
  wonders, catalogue artists, most-active month). New inline
  components: `KpiTile`, `DepthCard`, `DecadeBars`, `TopYearsBars`,
  `GenreDonut`, `AdditionsHistogram`.

**Verified**
- `pnpm exec tsc --noEmit` clean.
- `/stats` renders all 12 numbered sections; KPI values populate
  (3,218 records / 1,201 artists / 351 genres / 2.7 avg).
- 14 inline SVG elements rendered (decades, top years, donut, and
  monthly histogram).
- No `recharts` import remains anywhere in the codebase.

**Carry-overs**
- `@/components/CollectionStats` (the old 4-KPI card) is left on
  disk but no longer imported. Safe to delete in Phase 12 cleanup.
- `framer-motion` still used elsewhere (SearchOverlay, etc.) — not
  touched here.

---

## Phase 6 — Detail pages (Album, Artist)

**Date:** 2026-04-18
**User-visible change:** `/album/:slug` and `/artist/:slug` are rebuilt
as full-bleed editorial features. Each page opens with a cover-tinted
hero (cover as a shadowed object + mono crumb + display title + KV
grid + chip row + action row), splits into a main column and a sticky
`Quick Facts` sidebar, and closes out with release details, identifiers,
and copyright lines pulled from the existing JSON.

**AlbumDetailPage** — the cover floats to the right with a heavy
cover-colour shadow; title + artist avatar row sit left. Tracklist
renders as a hairline-ruled `POS · TITLE · DURATION` table with
mono side headers; LP groupings (A/B, multi-disc, box sets) keep
their existing computed structure and sit inside bordered paper
panels. Music-player, video, and per-artist bio sections are
preserved exactly, restyled into editorial rhythm using
`SectionHeader`. Scrobble, Spotify/Apple/Discogs service buttons,
meta tags, color extraction via `useAlbumColorsWithFallback`, and
all the track-source fallback plumbing are unchanged.

**ArtistDetailPage** — polaroid frame / tape effect / rotated
Kalam handwriting swapped for a clean circular portrait with a
per-artist tint pulled from a random album in the roster. Biography
is paragraph-broken into editorial prose; release grid stays on
`AlbumCard` with numbered CAT badges running 001..N.

**Biography fill** — both detail pages had the prose column pinned
to `max-w-[62ch]` which left a visible whitespace gap next to the
sidebar; cap removed so biographies flow to the full main-column
width.

**New helpers**
- Inline `KV` + `IdRow` components on AlbumDetailPage for the
  metadata strips and identifier rows.
- Inline `cleanBiography` / `numberShort` on ArtistDetailPage for
  the bio and follower formatting.

**Changed files**
- `src/pages/AlbumDetailPage.tsx` — full visual rewrite of the
  render tree; all data logic (redirect handling, tracklist source
  fallback, vinyl/LP grouping, total-duration calc,
  `getAlbumDescription`) preserved byte-for-byte. Dropped
  `useTheme` + `getAccessibleAccentColor` / `generateColorProperties`
  / `createHeroBackground` / `createGlowGradient` /
  `getEnhancedTextColor` imports — accent colour now comes straight
  from `useAlbumColorsWithFallback` via inline style.
- `src/pages/ArtistDetailPage.tsx` — full rewrite. Drops Polaroid
  frame, tape effect, `Kalam`/`Comic Sans` handwriting, and
  `createGlowGradient`/`getReadableTextColor` imports.

**Preserved (verified by grep + render)**
- Scrobble: `AlbumScrobbleButton` still sits in the hero action row.
- Spotify / Apple Music embeds: `MusicPlayerSection` rendered inside
  an editorial bordered panel.
- Videos: `VideoSection` untouched.
- All service buttons (Spotify / Apple / Last.fm / Discogs /
  Wikipedia) still rendered on both pages.
- OG + meta tags via `useMetaTags`.
- URL sanitisation redirect on AlbumDetailPage.
- Tracklist source fallback chain (Discogs → Spotify
  `services.spotify.tracks` → raw Spotify `raw_data.tracks.items` →
  Last.fm `raw_data.album.tracks.track`).
- Vinyl/LP grouping (A/B sides, multi-disc, box-set section headers).
- Artist bio cleaning (Last.fm / Wikipedia footers, 500-char
  truncation with "Read more").
- Color extraction via `useAlbumColorsWithFallback` (album) and
  `useAlbumColors` on a random album (artist).

**Verified**
- `pnpm exec tsc --noEmit` clean.
- `/artist/pavement/` renders hero + biography + 3-release grid;
  no console errors.
- `/album/doolittle-37029006` renders all five sections: About,
  Tracklist, Listen, Videos, About the artist.

**Phase 6 carve-out:** `GenrePage` left as-is per user instruction
(stays in Phase 5 scope).

---

## Phase 5 — Browse pages (Albums, Artists)

**Date:** 2026-04-18
**User-visible change:** `/albums/:page` and `/artists/:page` are rebuilt
in the editorial tone set by Phase 4. Each page opens with a `BrowseHeader`
(mono kicker + display title + subtitle + mono count strip), followed by
a hairline-ruled filter row and a dense editorial grid of Phase-3 tiles
with `CAT.` index badges numbered from the current page offset.

`AlbumsPage` keeps its full filter surface — wide search, then
`SORT / GENRE / YEAR` cells joined by vertical hairlines — and drops the
rounded `Card` shells around the empty state and pager.

`ArtistsPage` gets a matching filter row (search + sort) plus a single
full-width A–Z letter strip replacing the old pastel chip cluster. Each
letter sits in its own hairline cell with an inverse-ink active state;
letters with no artists stay dim and disabled.

**Per the user's instruction, `GenrePage` is left untouched** — the D3
force-simulation mindmap stays as-is for now.

**New files**
- `src/components/browse/BrowseHeader.tsx` — editorial page-header
  (num / kicker / title / subtitle / mono counts) with a closing
  hairline rule.

**Changed files**
- `src/components/FilterBar.tsx` — rewritten as a hairline-ruled row of
  `LABEL · value` cells. Same props, so `AlbumsPage` gets the new look
  for free.
- `src/pages/AlbumsPage.tsx` — swaps the old pastel loader / `Card`
  empty state / centered grid for the editorial header + hairline
  filter row + 6-col grid with numbered `AlbumCard`s. Pagination wears
  a thin top rule.
- `src/pages/ArtistsPage.tsx` — same treatment, with an inline
  `LetterCell` helper driving the A–Z strip. Dropped stale imports
  (`Users`, `Card`, `Input`) and shadcn empty-state components.

**Verified**
- `pnpm exec tsc --noEmit` clean.
- `/albums/1` renders header, filter row, grid (6 across at lg+), and
  pager; screenshot captured.
- `/artists/1` renders header, filter row, A–Z strip (inactive letters
  dim), and rank-numbered circular tiles; screenshot captured.
- URL-synced state (sort, genre, year, search, letter, page) still
  writes to `useSearchParams` and survives reload.

---

## Phase 4 — Home page

**Date:** 2026-04-18
**User-visible change:** the home page is rebuilt as an editorial spread.
A split hero rotates six featured records with a cover-tinted gradient
wash, a mono crumb (`FEATURED · NO. 02/06 · UPDATED …`), display title,
artist rule, and a 2×2 `YEAR / GENRE / ADDED / FEATURE` key-value block,
then `Open record` / `Crate dig` actions and numbered dots for manual
advance. Below the hero, the page splits into a main column and a sticky
editorial sidebar on wide viewports.

The main column runs through five section modules in a single horizontal
rhythm: `Recently Added · Albums` and `Recently Added · Artists` are
drag-scroll walls (wheel/drag/momentum + prev-next chevrons on hover);
`Genres · Selected Rooms` is a six-card mosaic with four sample covers
per genre; `From the Crates` and `Artists You Should Know` are editorial
grids with shuffle buttons; and a new `Catalogue · Latest Acquisitions`
bin-divider list rounds the column out (`# / swatch + title / artist /
year / genre / added`). Every list cell now shows a small cover
thumbnail instead of the flat colour swatch.

The sidebar renders `russ.fm / Index` totals (records / artists / genres
/ decades), a decade histogram of the entire collection, and a
top-genres cloud linking straight into `/albums/1?genre=…`.

**Readability fix:** the hover reveal on `AlbumCard` no longer uses a
90%-opaque ink overlay — it now paints the strip with the album's own
pre-computed `{ background, foreground }` pair from
`useAlbumColors`, falling back to `var(--ink)` / `var(--paper)` when a
palette is missing. That guarantees contrast on every cover.

**New files**
- `src/components/layout/DragWall.tsx` — horizontal drag/wheel scroll
  container with overflow-aware prev/next chevrons. Avoids
  `setPointerCapture` so child links still navigate on click.
- `src/components/home/HeroSection.tsx` — editorial split hero with
  tinted wash, KV grid, rule accent, numbered dots.
- `src/components/home/RecentAlbumsSection.tsx`,
  `src/components/home/RecentArtistsSection.tsx` — drag-wall strips.
- `src/components/home/GenresSection.tsx` — 2×2 cover mosaics per genre.
- `src/components/home/RandomCollectionSection.tsx`,
  `src/components/home/RandomArtistsSection.tsx` — editorial grids with
  `Shuffle crate` / `Shuffle roster` buttons.
- `src/components/home/CatalogueStrip.tsx` — 6-column bin-divider list
  with cover thumbnails per row.
- `src/components/home/StatsAside.tsx` — index totals, decade histogram,
  top-genres cloud (pure derivations from the already-loaded
  collection).

**Changed files**
- `src/pages/HomePage.tsx` — full rewrite into a `grid-cols-[1fr_320px]`
  main+aside layout with sticky sidebar on desktop. Section order keeps
  reading from `appConfig.homepage.sectionOrder`; added
  `catalogueStrip` to the supported keys.
- `src/config/app.config.ts` — appended `catalogueStrip` to the section
  order array.
- `src/components/AlbumCard.tsx` — hover-reveal now driven by
  `useAlbumColors` palette via inline `style`, dropping the tinted
  ink overlay that bled through light covers.

**Verified**
- Drag-wall clicks navigate correctly (Spiderland tile → `/album/…`).
- Hover strips are fully opaque on every cover (simulated via forced
  `translate-y` on all strips).
- Type-check (`pnpm exec tsc --noEmit`) green.
- Screenshots captured of hero (Spiderland featured), recent albums
  wall with visible `CAT.` badges + opaque hover strips, and sidebar
  with populated index totals + decade histogram.

**Known data gap (not blocking)**
- `public/album-colors.{json,css}` is out of sync with the collection —
  the most recent additions (Spiderland 37044327, 20 Jazz Funk Greats,
  Doolittle, Hauntings, etc.) aren't in the generated palette file, so
  their tinted shadows and hover strips use the ink/paper fallback. The
  scrapper's palette-extraction step needs to re-run before these tiles
  will glow. Flagged separately; doesn't affect typography or layout.

---

## Phase 3 — Shared display primitives

**Date:** 2026-04-18
**User-visible change:** album and artist cards across every listing page
are reborn as editorial tiles — square covers with a tinted float shadow
pulled from the dominant colour, mono hover strip revealing genre / year /
added date, grot title + mono subline. Chips (genre + metadata) lose the
pastel pills for sharp-cornered hairline chips. Pagination runs on mono
numerals with inverse active state. A new `SectionHeader` helper is
available for the upcoming home / browse / detail rebuilds.

**Also:** the nav brand mark swapped back from `◉` to the full spinning
vinyl glyph, still tinted crimson so it keeps its accent role. Honours
`prefers-reduced-motion` (`motion-safe:animate-spin-slow`).

**New files**
- `src/components/layout/SectionHeader.tsx` — `num / label / count /
  action` editorial section header with a hairline rule.
- `src/components/layout/index.ts` now re-exports it.

**Changed files**
- `src/components/Navigation.tsx` — inline `BrandMark` spinning-record SVG
  replaces the `◉` dot.
- `src/components/AlbumCard.tsx` — rewritten as an editorial tile:
  - Square `aspect-square` cover on paper-2, box-shadow tinted from
    `useAlbumColors(uri).background`.
  - Optional `index?: number` renders a mono `CAT. NNN` badge top-left.
  - Hover reveals a mono `GENRE / YEAR / ADDED` strip from the bottom
    edge.
  - Meta: grot title with `line-clamp-2`, mono artist + year subline.
  - Dropped the Last.fm dropdown menu from the card (scrobble remains
    functional on the album detail page; noted in NOTES.md).
- `src/components/ArtistCard.tsx` — rewritten: round-photo tile, mono
  rank, grot name, mono `NN releases` subline. Props unchanged.
- `src/components/ui/genre-tag.tsx` — sharp-cornered hairline chip with
  `tone: default | tinted` and `mono: true | false` variants. Still
  linkable to `/albums/1?genre=...`.
- `src/components/ui/metadata-badge.tsx` — sharp-cornered mono chip with
  `tone: default | muted | ghost` variants.
- `src/components/ui/pagination.tsx` — rewritten in mono: flush hairline
  buttons, `Prev · 01 02 03 … 10 · Next`, inverse active state. Compound
  API (`Pagination`, `PaginationContent`, `PaginationItem`,
  `PaginationLink`, `PaginationPrevious`, `PaginationNext`,
  `PaginationEllipsis`) unchanged so existing call sites keep working.

**Verification**
- `pnpm exec tsc --noEmit` clean.
- `pnpm run build:fast` green.
- `pnpm run dev` + Chrome: album grid on `/albums/1` renders new tiles,
  nav stays pinned on scroll, images load, no console errors.
- `useAlbumColors` cache keeps shadow tinting snappy across a full grid.

---

## Phase 2 — Shell (Navigation, Footer, PageContainer)

**Date:** 2026-04-18
**User-visible change:** the rounded floating nav island is gone. The page
is now anchored by an editorial top bar (brand + mono catalogue tag, a
bordered nav pill with inverse `is-on` state, inline search with `/` hint,
user profile, theme toggle) and a mono footer with a single hairline
divider. Navigation is sticky — not fixed — so page content flows naturally
below the bar without reserved top space.

**Changed files**
- `src/components/Navigation.tsx` — complete rewrite:
  - Sticky top bar, `max-w-[1640px]` gutter, hairline rule below.
  - Brand lockup: crimson `◉` + `russ.fm` grot 18px + mono tag
    `/ PERSONAL RECORD COLLECTION` (desktop only).
  - Nav pill with `is-on` inverse state (ink bg / paper text).
  - Inline search input (260–320px) with `/` kbd hint; focusing opens
    the existing desktop search overlay. `/` keyboard shortcut focuses
    the input on desktop and opens the mobile search on narrow viewports.
  - Mobile menu overlay rebuilt: paper background, mono counter per item,
    rule-divided rows, theme + profile controls at the bottom.
  - **Dropped Fuzzbox** (external link removed), **added Genres**; nav
    mirrors the actual route set.
- `src/components/Footer.tsx` — rewrite:
  - Single top rule, mono colophon (`© 2025 RUSS.FM · A PERSONAL RECORD
    COLLECTION`) with crimson `◉`, internal links in mono uppercase, external
    icons (Last.fm, Discogs, GitHub) on the right.
  - Reads from existing `appConfig.footer` — no config shape changes.
- `src/components/layout/PageContainer.tsx` — simplified:
  - `standard`: padded `max-w-[1640px]` gutter; `hero`: full-bleed.
  - Removed the negative-margin compensation (`-mt-32`) that was
    needed under the fixed nav.
- `src/App.tsx` — dropped `md:pt-32` off `<main>` (the sticky nav lives
  in normal flow now); added `font-grot` to the root so the Inter Tight
  stack is explicit even where Tailwind `font-sans` isn't applied.

**Verification**
- `pnpm exec tsc --noEmit` clean.
- `pnpm run build:fast` green.
- `pnpm run dev` + Chrome visual: top bar renders correctly, sticky on
  scroll; footer lays out on a single row desktop; all NAV routes still
  navigate; `/` focuses the search input; user profile menu + theme
  toggle still work.

**Known follow-ups (deferred to later phases)**
- Theme toggle and UserProfileMenu buttons still render as pill-rounded
  because they use `rounded-full` internally. Phase 3 touches shared
  display primitives and will align these with sharp corners where
  appropriate.
- Hero and card visuals on Home are still the pre-existing components;
  Phase 3 reskins cards, Phase 4 rebuilds Home.

---

## Phase 1 — Design tokens, Inter Tight, JetBrains Mono

**Date:** 2026-04-18
**User-visible change:** site inherits the new paper/ink palette and the
Inter Tight typeface globally. No components restructured yet — existing
shell, cards, and pages still present their current layouts, but in the
redesign's colours and typography.

**New files**
- `src/styles/design-tokens.css` — paper/ink/rule/hl/tint CSS variables,
  dark-mode variants, and the two typeface stacks.

**Changed files**
- `package.json` — added `@fontsource-variable/inter-tight` and
  `@fontsource-variable/jetbrains-mono` (self-hosted, no Google Fonts
  runtime fetch).
- `src/index.css`:
  - Dropped Google Fonts `@import` (Inter + Outfit).
  - Imported the two Fontsource packages + `design-tokens.css`.
  - Remapped shadcn HSL slots (`--background`, `--foreground`, `--card`,
    `--border`, etc.) to paper/ink values in both light and dark.
  - Set `--radius: 0` for sharp corners globally (artist photos still
    `rounded-full` via explicit class).
  - Rewrote the base heading scale to the editorial tight grotesk scale
    (balanced display type, negative letter-spacing).
  - Kept `:focus-visible` outlines intact; only `:focus:not(:focus-visible)`
    is suppressed.
- `tailwind.config.js` — extended `theme.colors` with `paper{,-2,-3}`,
  `ink{,-2,-3,-dim}`, `rule{,-strong}`, `hl`, `tint`; `fontFamily.grot`,
  `fontFamily.mono`, and `fontFamily.sans` aliased to the grot stack so
  existing `font-sans` utilities pick up Inter Tight.

**Verification:**
- `pnpm run build:fast` green (3251 modules, fonts bundled + subset).
- `pnpm run dev` serves with no runtime errors; fonts load from
  `node_modules/@fontsource-variable/...`.
- Visual eyeball on `/`: Inter Tight renders on the hero title, body
  backgrounds warm to paper, existing shadcn components still render
  correctly in the new palette.

**Notes**
- Pre-existing lint errors in `SearchResultsPage`, `StatsPage`, and
  `wrapped/components/*` are untouched by this phase; they belong to
  earlier code and will be addressed in the relevant later phases.

---

## Phase 0 — Tracking & scaffolding

**Date:** 2026-04-18
**User-visible change:** none (infra only).

**New files**
- `docs/project/Redesign/CHANGELOG.md` — this file.
- `docs/project/Redesign/NOTES.md` — durable decisions log.
- `src/config/redesign.config.ts` — tunable knobs that will drive the
  redesigned pages. Defaults match current behaviour so importing it is a
  no-op until later phases start reading the values.

**Decisions locked** (also in NOTES.md):
- Fuzzbox nav item dropped; nav mirrors existing routes.
- Now-spinning bottom bar skipped.
- Tweaks panel is dev-only, opened via `Cmd/Ctrl+Shift+D`.
- Theme default follows system preference.
- Tailwind stays as styling base; tokens extend the config.
- Reference code in `docs/project/Redesign/{app,pages}.jsx` + `style.css` is a
  visual reference only; we re-implement against the existing React +
  Tailwind + shadcn shell and keep `react-router-dom`.

**Verification:** `pnpm run lint` + `pnpm run build:fast`.
