# Components Reference

This document covers the React components in the russ.fm frontend.

> **Player redesign.** The site uses the "player" design: a dark ground,
> colour floods lifted from each sleeve, big Archivo display type and
> records drawn as physical objects. [`design-system.md`](./design-system.md)
> is the canonical design reference (tokens, type, principles, page
> patterns). This document lists the components that implement it.

## Player components (`src/components/player/`)

All exported from `@/components/player`.

| Component | File | Role |
|-----------|------|------|
| `FloodProvider` | `FloodContext.tsx` | Wraps the app in `App.tsx`. Holds the page's current flood and writes it to `--flood` / `--flood-ink` on `<html>`. Provides two contexts: `FloodValueContext` (the flood / ink value) and `FloodSetterContext` (the setter). |
| `usePageFlood`, `useFloodValue` | `flood-context.ts` | Set / read the page flood. `usePageFlood` reads only the setter context, so a page that sets the flood does not re-render when it changes; `useFloodValue` (the navigation) reads the value. See [Hooks](./hooks.md#flood-hooks). |
| `CoverHero`, `AFTER_HERO` | `CoverHero.tsx` | Cover-led hero section. |
| `HeroRecord` | `HeroRecord.tsx` | Big sleeve with the disc out to the right, shrink-wrap and an optional sticker. The home hero passes `spinning={on}` so only the visible record spins. |
| `Sleeve` | `Sleeve.tsx` | Cover art with a card edge and drop shadow. |
| `Vinyl` | `Vinyl.tsx` | Grooved disc with a coloured centre label, spinning at 33⅓ (or 45). |
| `Sticker` | `Sticker.tsx` | Round "Added 25 SEP 2026" shop sticker. |
| `RecordTile` | `RecordTile.tsx` | A record in a row or grid. |
| `FitTitle` | `FitTitle.tsx` | Display title sized to its column: starts at `max` px and shrinks (binary search on `scrollWidth`) until the longest word fits; wraps only between words, balanced. Refits on column resize and once fonts load. A word too long even at `min` (default 20) may break. Used for the artist name. |
| `PillLink` | `Pill.tsx` | Rounded link button, outline or solid. |
| `SectionHeading` | `SectionHeading.tsx` | Plain section title with optional note and "see all" link. |

The class-based pieces (`.sleeve`, `.vinyl`, `.rec`, `.sticker`, `.pill*`,
`.icon-btn`, `.chip`, `.tile` / `.tile-cap`, `.shelf-scroll`,
`.flood-surface`) live in `src/styles/player.css`.

### CoverHero

```tsx
import { AFTER_HERO, CoverHero, HeroRecord } from '@/components/player';

<CoverHero flood={flood} art={<HeroRecord ... />}>
  {/* title, meta, actions */}
</CoverHero>
<div className={cn('mx-auto max-w-[1640px] px-5', AFTER_HERO)}>…</div>
```

| Prop | Type | Description |
|------|------|-------------|
| flood | `Flood` | From `floodFor()`; paints the section background and text |
| art | `ReactNode` | Cover object, usually `HeroRecord`. Sits flush on the bottom edge and hangs over the next section |
| children | `ReactNode` | Text column (right of the cover on desktop, above it on phones) |
| className | `string` | Optional |

The section after a `CoverHero` must add the `AFTER_HERO` top padding
(`pt-24 lg:pt-36`) to clear the overhanging cover.

### HeroRecord

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| src / srcSet | `string` | – | Sleeve image (use `image-utils`, `hi-res`) |
| alt | `string` | – | Alt text |
| labelColour | `string` | – | Vinyl centre label, normally `flood.ground` |
| labelText | `string` | – | Small text printed on the label |
| discOut | `number` | `15` | How far the disc sits out of the sleeve, % of width |
| spinning / fast | `boolean` | `true` / `false` | Spin, and spin at 45 (used while scrobbling) |
| sticker | `{ date, background, color, label? }` | – | Optional `Sticker` on the corner |
| eager | `boolean` | `true` | Eager-load the image |

### Sleeve, Vinyl, Sticker

- `Sleeve` — `src`, `alt`, optional `shrinkwrap`, `loading`, `srcSet`,
  `sizes`, `children` (overlays such as the box set "From the box" band).
  Uses `handleImageError` for fallbacks.
- `Vinyl` — `label` (centre-label colour, usually the sleeve's dark
  background swatch), `spin`, `fast`, `text`. Always `aria-hidden`.
- `Sticker` — `date` (ISO), `label` (default `Added`), `background`,
  `color`, `size` (`lg` 128px, `sm` 92px). Renders nothing for an invalid
  date; carries an `aria-label` with the full date.

### RecordTile

```tsx
<RecordTile album={album} palette={colourMap?.[album.uri_release]} meta="1977 · Vinyl" />
```

| Prop | Type | Description |
|------|------|-------------|
| album | `Pick<Album, 'uri_release' \| 'release_name' \| 'release_artist'>` | Record to show |
| palette | `AlbumColorPalette \| null` | Sets the colour bar and disc label |
| meta | `ReactNode` | Mono line under the artist |
| showArtist / showText | `boolean` | Default `true` |
| to | `string` | Override the link (defaults to the album page) |

The disc slides out of the sleeve on hover and focus (`.rec` in
`player.css`). It is rendered with `spin={false}`: the disc sits behind
the sleeve until hover, and a wall of spinning discs would cost a
compositor layer and a repaint each. The image is always the `medium`
size.

### PillLink and pills

`PillLink` takes `to`, `children`, `solid?: { background, color }`,
`size` (`sm` | `md` | `lg`), `arrow` (default `true`). External URLs
(`http…`) open in a new tab with an out-arrow; internal paths use
`<Link>`. The `.pill` classes are also used directly on `<button>`s.

### SectionHeading

`title`, optional `note` (dim mono text), `link: { to, label }`, `as`
(`h1`–`h3`, default `h2`), `size` (`lg` | `md` | `sm`) and `children`
(extra controls placed before the link, e.g. sort pills).

## Album components (`src/components/album/BoxSet.tsx`)

Used by `AlbumDetailPage` when the album has `boxset_contents`. The disc
list comes from `buildBoxDiscs()` in [`src/lib/boxDiscs.ts`](./utilities.md#box-set-discs-srclibboxdiscsts).

| Component | Props | Role |
|-----------|-------|------|
| `BoxHeroArt` | `boxUri`, `boxTitle`, `discs`, `selected`, `onSelect`, `flood`, `added` | Hero art: the box cover with a thick stacked edge, its albums fanned out behind it (the selected one pulled out) and a sticker. Each fanned sleeve is a button that selects that disc. |
| `BoxContents` | `boxUri`, `discs`, `selected`, `onSelect`, `colours`, `boxFlood`, `artist` | "In this box" section: a tab row of sleeves and a panel in the selected album's flood colour with its sleeve and disc, tracklist grouped by side, a scrobble button for that disc and an "Open album page" link when the disc has its own page. |

Discs with no linked album page use the box cover with a "From the box"
band and the section header as their title.

## Browse components (`src/components/browse/BrowseHeader.tsx`)

| Component | Props | Role |
|-----------|-------|------|
| `BrowseHeader` | `title`, `note`, `current` (`genres` \| `labels` \| `decades` \| `countries` \| `null`), `hidePills`, `children` | Page title in `t-disp` with the count in dim mono beside it, then pills linking the four browse sections (the current one solid). |
| `FacetFan` | `albums` (lead first, up to five), `linked`, `large` | A fan of sleeves that spreads further when the surrounding `.group` is hovered. `linked` makes each sleeve a link; `large` loads the lead at `hi-res`. |
| `FacetCard` | `to`, `title`, `meta`, `flood`, `albums`, `size` (`lg` \| `md`) | A facet as a colour card: the representative sleeve's flood with a `FacetFan`. |

Colours and sleeve picks come from [`facetSleeves.ts`](./utilities.md#browse-sleeve-helpers-srccomponentsbrowsefacetsleevests).

## Genre components (`src/components/genres/`)

`GenreExplorerPanel` and `GenreGraph` take an optional `colorMap`
(the `useAlbumColorMap()` result). Nodes, the selected-genre control bar
and atlas rows are coloured from it via [`genreColours.ts`](./utilities.md#genre-colours-srccomponentsgenresgenrecoloursts):
album nodes use their own sleeve, artist and genre nodes the most vivid
recent record. `GenreGraph` also takes `centreFlood` for the centre node.
Menus use the same rounded `--ground-2` panels as the rest of the site.

## Layout primitives (`src/components/layout/`)

| Component | Status |
|-----------|--------|
| `PageContainer` | In use. `standard` gives the `max-w-[1640px]` container with the nav's side gutters and cream text; `hero` goes edge to edge. |
| `EditorialEmpty` / `EditorialSkeleton` | `PageStates.tsx`. In use by the browse and genre pages for empty and loading states (rounded `--ground-2` panel; pulsing tile grid). |

All three are exported from `@/components/layout`.

## Core Components

### Navigation (`src/components/Navigation.tsx`)

Sticky header that shares the page's flood colour.

- Reads `useFloodValue()`: while the page is at the top the header is
  painted in the hero's flood and ink, so header and hero read as one
  surface. After 120px of scroll it turns to near-opaque dark ground
  (`rgba(14,13,12,.97)`, no backdrop blur) with cream text.
- `xl+`: `russ.fm` wordmark, Home / Albums / Artists / Genres links, a
  Browse dropdown (Overview, Labels, Decades, Countries), Stats and
  Wrapped, a pill search field (`/` focuses it) with `SearchOverlay`, a
  Shuffle pill and the Last.fm `UserProfileMenu`.
- Below `xl`: wordmark, search and menu icon buttons (Shuffle and the
  profile menu from `md`). The menu opens a full-screen panel in the flood
  colour with every route in large display type; body scroll is locked
  while it is open. Search opens `MobileSearchModal`.
- No theme toggle.

**Props:** none (uses router and flood context).

### Footer (`src/components/Footer.tsx`)

Dark-ground footer: a large `russ.fm` wordmark, a data-sources and
copyright line (year computed at render), internal links (Albums, Artists,
Genres, Browse, Stats, Wrapped, Shuffle) and small pills for the external
links in `appConfig.footer.links.external`.

### Logo (`src/components/Logo.tsx`)

Spinning record glyph with an optional `className`, used by the Wrapped
presentation.

```tsx
<Logo className="h-8 w-8" />
```

The spinning record `BrandMark` has been removed; the header and footer
use a `t-disp` wordmark instead.

## Artist Components

### ArtistCard (`src/components/ArtistCard.tsx`)

Round artist photo with a ring in the flood colour of the artist's latest
sleeve (the ring widens on hover and focus), name in `t-dispn` and the
record count in mono.

| Prop | Type | Description |
|------|------|-------------|
| artist | `{ name, uri, albumCount, image }` | `image` is built by the caller with `image-utils` |
| palette | `AlbumColorPalette \| null` | Palette of the latest record; neutral ring without one |
| onClick | `() => void` | Render as a button instead of a link |
| index | `number` | Accepted; not rendered |

## Search Components

### SearchOverlay (`src/components/SearchOverlay.tsx`)

Drop-down results panel under the desktop nav search field: a rounded
`--ground-2` panel with a status line, an "All results" pill and an `Esc`
hint, then `SearchResults` in the `compact` layout.

```tsx
<SearchOverlay
  isVisible={open}
  onClose={close}
  searchTerm={term}
  setSearchTerm={setTerm}
  anchorRef={inputRef}
/>
```

### MobileSearchModal (`src/components/MobileSearchModal.tsx`)

Full-screen sheet (`role="dialog"`) with a back button, a pill search
field and `SearchResults` in the `list` layout. Props: `isOpen`,
`onClose`.

Neither `SearchOverlay` nor `MobileSearchModal` builds the Fuse index until it is opened
(`useInstantSearch('', isVisible)` / `useMobileSearch(isOpen)`), so the index is not built on
page load.

### SearchResults (`src/components/SearchResults.tsx`)

Results grouped into Albums and Artists. Every sleeve carries its flood
colour (bar on tiles, edge stripe on rows); artists borrow the colour of
their first matching record.

| Prop | Type | Description |
|------|------|-------------|
| results | `SearchResult[]` | From `searchService` |
| isLoading / isIndexing | `boolean` | Loading states |
| error | `string \| null` | Error message |
| searchTerm | `string` | Current query |
| layout | `'grid' \| 'list' \| 'compact'` | `grid`: `RecordTile`s and `ArtistCard`s (results page); `list`: rows with thumbnails (mobile); `compact`: nav drop-down |
| onResultClick | `() => void` | Called when a result is chosen |
| showLimitMessage / showViewAllLink | `boolean` | Optional footers |

## Music Player Components

### MusicPlayerSection (`src/components/MusicPlayerSection.tsx`)

Embedded player with service selection, used in the album page's
"Listen" section.

### SpotifyEmbed / AppleMusicEmbed

Service embeds. Both always request the service's dark player theme
(`theme: 'dark'`), since the site is dark-ground only, whatever the
operating system's light/dark setting.

### PlayerToggle (`src/components/PlayerToggle.tsx`)

Toggle between Spotify and Apple Music players.

## Scrobbling Components

### AlbumScrobbleButton (`src/components/AlbumScrobbleButton.tsx`)

Scrobbles a whole album, one side, or one box set disc to Last.fm. Renders
a `.pill` button with a progress fill (`.pill-fill`) that grows as tracks
are sent.

```tsx
import { AlbumScrobbleButton } from '@/components/AlbumScrobbleButton';
import { toScrobbleTracks } from '@/lib/scrobbleTracks';

<AlbumScrobbleButton
  album={{ artist: album.release_artist, album: album.release_name, tracks: toScrobbleTracks(tracks) }}
  tone={{ background: flood.ink, color: flood.flood }}
  pillSize="lg"
  onActiveChange={setScrobbling}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| album | `{ artist, album, tracks }` | – | Payload; build `tracks` with `toScrobbleTracks` |
| label | `string` | `'Scrobble album'` | Idle label, e.g. `Scrobble side A` |
| tone | `{ background, color }` | – | Solid fill (flood ink on flood). Omit for an outline pill |
| pillSize | `'sm' \| 'md' \| 'lg'` | `'md'` | Pill size |
| onActiveChange | `(active: boolean) => void` | – | Called when a scrobble starts and finishes, so heroes can slide the disc out and spin it at 45 |
| fullWidth, className, style | – | – | Layout |

Build `tracks` with [`toScrobbleTracks`](./utilities.md#toscrobbletracks)
rather than mapping the tracklist inline — it strips section-header rows
and carries per-track compilation artists through.

After a run the label reads `Scrobbled N tracks`, or `Scrobbled 13 of 15`
when Last.fm ignores or the worker skips some tracks. When signed out the
button opens the Last.fm connect flow. See
[Last.fm integration](../api-integrations/lastfm.md#album-scrobbling).

## User Components

### UserProfileMenu (`src/components/UserProfileMenu.tsx`)

Last.fm account control in the nav. A round button that inherits
`currentColor`, so it sits on the nav's flood like the other icon buttons.
Signed in, the button shows the user's avatar and opens a dropdown with
the username, play count, profile link and disconnect; signed out, it
shows the Last.fm icon and opens `LastFmAuthDialog`.

### LastFmAuthDialog (`src/components/LastFmAuthDialog.tsx`)

Last.fm connect / status dialog, opened by its `children` trigger. Shows
the connected account (avatar, play count, profile link, disconnect) or a
connect button, using cream pills on the dark dialog.

## Dialogs and menus (`src/components/ui/`)

`dialog.tsx` and `dropdown-menu.tsx` are restyled for the dark ground:
rounded `--ground-2` panels with a `--cream-rule` ring, `t-disp` dialog
titles, 44px close button and menu items, and animations disabled under
`prefers-reduced-motion`.

## Removed components

| Removed | Replaced by |
|---------|-------------|
| `theme-toggle.tsx` (`ThemeToggle`), `theme-provider.tsx` (`ThemeProvider`) | Nothing; the site is dark-ground only and `index.html` sets `class="dark"` |
| `AlbumCard.tsx`, `AlbumModal.tsx`, `CollectionStats.tsx`, `SearchFAB.tsx`, `ScrobbleButton.tsx`, `ScrobbleProgress.tsx` | Nothing; they were no longer used. Use `RecordTile`, `AlbumScrobbleButton` and the nav search |
| `layout/EditorialPrimitives.tsx` (`DossierHero`, `FactGrid`, `FactCell`, `RailSection`, `CatalogueList`, `StageVinyl`), `layout/SectionHeader.tsx`, `layout/DragWall.tsx` | Player components (`CoverHero`, `SectionHeading`, `.shelf-scroll` rows). `EditorialEmpty` / `EditorialSkeleton` moved to `layout/PageStates.tsx` |
| `ui/avatar-group.tsx`, `ui/badge.tsx`, `ui/input.tsx`, `ui/metadata-badge.tsx`, `ui/progress.tsx`, `ui/separator.tsx` | Nothing; they were no longer used |
| `BrandMark.tsx` | `t-disp` `russ.fm` wordmark in the nav and footer |
| `FilterBar.tsx` | Inline sort pills, format chips, search and pill selects on `AlbumsPage` / `ArtistsPage` |
| `components/home/*` (`HeroSection`, `RecentAlbumsSection`, `RecentArtistsSection`, `RandomCollectionSection`, `RandomArtistsSection`, `GenresSection`, `StatsAside`) | Local sections in `HomePage.tsx` built on `CoverHero`, `HeroRecord`, `RecordTile` and `SectionHeading` |
| `ui/genre-tag.tsx` (`GenreTag`) | Outline mono genre links and `.chip` |
| `ui/pagination.tsx` | Page-local pill pagers |
| `ui/service-button.tsx` (`ServiceButton`) | `PillLink` and `.pill` buttons |

## shadcn/ui Base Components

Located in `src/components/ui/`:

| Component | File | Description |
|-----------|------|-------------|
| Button | `button.tsx` | Button variants |
| Select | `select.tsx` | Dropdown select |
| Dialog | `dialog.tsx` | Modal dialog |
| DropdownMenu | `dropdown-menu.tsx` | Dropdown menu |
| Tabs | `tabs.tsx` | Tab navigation |
| Tooltip | `tooltip.tsx` | Tooltips |
| Alert | `alert.tsx` | Alert messages |
| Switch | `switch.tsx` | Toggle switch |
| Card | `card.tsx` | Card container |
| Avatar | `avatar.tsx` | Avatar image |

---

## Component Best Practices

### Image Handling

Always use utility functions for images:

```tsx
// Correct
import { getAlbumImageFromData } from '@/lib/image-utils';
<img src={getAlbumImageFromData(album.uri_release, 'medium')} />

// Incorrect
<img src={album.images_uri_release['medium']} />
```

### Colour

Take colours from the sleeve with `floodFor()` and put text on a flood
with its `ink` / `sub` values (or `inkOn()`), never a fixed accent. See
[design-system.md](./design-system.md#colour-helpers--srclibsleevecolourts).

### Loading States

Always handle loading:

```tsx
function AlbumDetail({ slug }) {
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);

  if (loading) return <AlbumDetailSkeleton />;
  if (!album) return <NotFound />;

  return <AlbumContent album={album} />;
}
```

### Memoization

For expensive renders:

```tsx
const MemoizedRecordTile = memo(RecordTile, (prev, next) => {
  return prev.album.uri_release === next.album.uri_release && prev.palette === next.palette;
});
```
