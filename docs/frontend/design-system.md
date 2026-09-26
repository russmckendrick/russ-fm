# Player design system

The site uses the "player" design: a warm near-black ground, bold colour floods lifted from each sleeve, big condensed and extended type, and records treated as physical objects (sleeves, discs, stickers, crates, boxes). Content leads. Section titles are plain labels ("Latest additions", "Most collected", "Tracklist"), never taglines or story copy.

## Principles

- **The cover is the hero.** Detail pages and the home page open with the sleeve at full size, flush on the bottom of a colour flood and hanging over the next section.
- **Colour comes from the record.** Every flood, tile bar, spine, chip and panel uses a colour derived from the sleeve palette (`album-colors.json`), never a fixed accent.
- **Tangible, not skeuomorphic.** Discs slide sideways out of sleeves, stickers sit on the corner, box sets have a thick edge. No fake hardware, no invented gadget names, no gradients on buttons.
- **Smooth motion.** Colour changes fade (~0.8s), records slide on `cubic-bezier(.2,.8,.2,1)`. Everything respects `prefers-reduced-motion`.
- **Dark ground only.** There is no light theme; light comes from the floods.

## Tokens

Defined in `src/styles/player.css` and `src/styles/design-tokens.css` (legacy names, now dark values).

| Token | Value | Use |
| --- | --- | --- |
| `--ground` | `#0e0d0c` | page background |
| `--ground-2` / `--ground-3` | `#171512` / `#211d19` | raised panels, menus |
| `--cream` | `#fbf7ef` | primary text on ground |
| `--cream-dim` | `#a9a39a` | secondary text on ground |
| `--cream-rule` | `rgba(251,247,239,.14)` | hairlines |
| `--neutral-flood` | `#e8e2d6` | flood for sleeves with no usable colour |
| `--flood` / `--flood-ink` | set per page | current hero colour (read by the nav) |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | record and colour motion |

Legacy Tailwind names (`bg-paper`, `text-ink`, `text-ink-3`, `border-rule`) still resolve and now map to the dark ground/cream values, so older components stay legible.

## Type

| Class | Face | Use |
| --- | --- | --- |
| `.t-disp` | Archivo 125% width, 900, uppercase | section titles, artist names, numbers |
| `.t-cond` | Archivo 66% width, 900, uppercase | album titles in heroes, big stats, sticker dates |
| `.t-dispn` | Archivo 112%, 800 | artist links in heroes |
| `.t-mono` / `.t-kicker` | JetBrains Mono | dates, positions (A1), counts, small labels |
| body | Hanken Grotesk Variable | everything else |

Scale titles to the longest word in condensed type so long album names never overflow (`fs = min(max, colWidth / (longestWord * 0.52))`).

## Colour helpers — `src/lib/sleeveColour.ts`

- Every sleeve's colours are decided at build time by `scripts/generate-album-colors.js` (Apple Music artwork colours included), so a sleeve has the same flood on every page. The helpers only read them.
- `floodFor(palette)` → `{ flood, ink, sub, ground, glow, secondary }`, straight from the palette. Monochrome sleeves have a pale neutral flood tinted with the sleeve's own cast; a missing palette gets `#e8e2d6` on a dark ground. `glow` is the flood lifted to 3:1 on the ground, for accents below the hero.
- `vividFrom(palette)` (the flood when `vivid > 0`, else `null`), `colourBar(flood)` (the flood, split 62/38 with `secondary` when there is one), `colourSortKey(palette)` (bold sleeves by hue, then monochrome ones light to dark), `luminance`, `inkOn`, `subInk`, `blendedFlood(colours)` (a vertical gradient through several floods, the first held at the top for the nav; the ink is chosen for the top colour and the others are lightened or darkened until that ink reads at 4.5:1), and the `INK` / `CREAM` / `GROUND` / `NEUTRAL_FLOOD` / `BOLD_VIVID` (`vivid` threshold for "bold" sleeves) constants.
- Palettes come from `useAlbumColors(uri)` (one) or `useAlbumColorMap()` (all, for walls/rows); the album page's swatch strip comes from `useAlbumSwatches(uri)`.

## Components — `src/components/player/`

| Component | What it is |
| --- | --- |
| `FloodProvider`, `usePageFlood(flood, ink)`, `useFloodValue()` | Page sets its flood; the sticky nav reads it with `useFloodValue` and paints itself in the same colour until scrolled, then turns dark. Call `usePageFlood` in any page with a colour hero. |
| `CoverHero` + `AFTER_HERO` | Cover-led hero layout. `art` hangs over the next section; that section must add `AFTER_HERO` top padding. On phones the text comes first and the cover below. |
| `HeroRecord` | Big sleeve + spinning disc out to the right (`discOut` %) + shrink-wrap + optional `sticker`. `spinning` turns the spin off; the home hero spins only the visible record. |
| `Sleeve`, `Vinyl`, `Sticker` | The physical pieces. `Vinyl` label colour is the sleeve's `ground`. |
| `RecordTile` | Sleeve in a row/grid; disc slides out on hover (it does not spin); colour bar (`colourBar()`: two-tone when the sleeve has a secondary colour); title/artist/meta. |
| `PillLink`, `.pill`, `.pill-solid`, `.pill-lg`, `.pill-sm` | Rounded buttons (44px; `.pill-lg` 56px, `.pill-sm` 40px). Solid pills use the flood's ink as fill and the flood as text. `.pill-fill` is the progress fill used by the scrobble button. |
| `.icon-btn` | 48px round icon button (nav, hero transport controls). |
| `SectionHeading` | Plain `t-disp` title + optional mono note + "see all" link. |
| `.tile` / `.tile-cap` | Cover tile with a caption sliding up on hover (walls, grids). |
| `.chip` | Genre/facet pill coloured by a representative sleeve. |
| `.shelf-scroll` | Horizontal rows that scroll without a visible scrollbar. |

Page-specific pieces built on these: `BoxHeroArt` / `BoxContents` (`src/components/album/BoxSet.tsx`) and `BrowseHeader` / `FacetFan` / `FacetCard` (`src/components/browse/BrowseHeader.tsx`). See [components.md](./components.md).

Data: use `loadCollection()` / `useCollection()` from `src/lib/collection.ts` (cached) instead of fetching `collection.json` per page, and `loadDetailJson()` for per-release / per-artist JSON. Images always go through `src/lib/image-utils.ts` (`hi-res` for heroes, `medium` for tiles, `avatar` for artist avatars). Years go through `originalYear()` / `originalDecade()` from `src/lib/releaseYear.ts` for anything that orders, groups, filters or labels records by year; never read `date_release_year` directly, as it is often the reissue date.

## Page patterns

- **Home**: `CoverHero` rotating through recent additions (flood fades per record, disc slides out, sticker pops), numbered progress bars + skip/pause. Then latest additions row, most collected artists, genre chips, headline counts, random picks, browse-by-colour strip.
- **Album**: `CoverHero` with scrobble as the main action; tracklist grouped by side (scrobbling is whole-album, from the hero); Last.fm panel in the flood colour; about, listen (Spotify/Apple Music), videos, artist, details sidebar, similar albums.
- **Box set**: the box cover (thick edge) as the hero with its discs fanned out behind; an "In this box" selector whose panel takes the selected album's colour, tracklist and scrobble. Discs come from the box's own tracklist section headers (`buildBoxDiscs` in `src/lib/boxDiscs.ts`); ones without a linked album are shown as generic sleeves using the box cover.
- **Artist**: the whole top blends through the sleeve colours of the last three additions (`blendedFlood`), newest at the top by the nav; the discography is a `RecordTile` grid with a Recently added (default, date added on each tile) / By year (grouped by decade of original release, oldest first) toggle.
- **Albums**: sort pills including **Colour** (hue-sorted wall).
- **Lists / stats / browse**: `t-disp` page title with the count in dim type beside it, chip filters, tiles in the sleeve colours.

## Performance

- Only visible, meaningful records spin. `RecordTile` renders its `Vinyl` with `spin={false}`, and the home hero passes `spinning` only to the active `HeroRecord`; a grid of spinning discs costs a compositor layer and a repaint per tile.
- Timers that only draw progress are CSS animations, not React state. The home hero's bar is `.hero-progress` (`@keyframes hero-progress` in `player.css`) and `onAnimationEnd` advances the record.
- The scrolled nav is a near-opaque solid (`rgba(14,13,12,.97)`) rather than a `backdrop-blur`.
- Use the cached loaders (`useCollection`, `loadDetailJson`) and memoised helpers (`getGenreExplorer`, `excludeBoxsetMembers`). Memoised results are shared between pages, so copy before sorting in place: `[...excludeBoxsetMembers(albums)].sort(...)`.

## Accessibility

Real `<button>`/`<a>` elements, 44px touch targets, `aria-label` on icon-only buttons, `aria-selected` on tab-like selectors. Text on floods always uses `inkOn()`. Motion is disabled under `prefers-reduced-motion`.
