# Redesign — Durable Decisions

Things that were decided and shouldn't be re-litigated without a reason.
Add entries; don't rewrite history.

---

## Scope & rules

- **Functionality is frozen.** Every existing route, feature, and data
  contract stays behaviourally identical. The redesign is visual only.
- **Tailwind stays.** Extending `tailwind.config.js` and `index.css` tokens
  is preferred over hand-written CSS. A single `src/styles/design-tokens.css`
  holds raw CSS variables; Tailwind utilities map onto them.
- **Nothing hard-coded.** Tunables (per-page counts, hero rotation,
  wall item counts, density defaults, etc.) go through config files:
  - `src/config/app.config.ts` — existing user-facing knobs (pagination,
    hero count, section order, footer links).
  - `src/config/redesign.config.ts` — new knobs introduced by the redesign
    (density, tint, mono labels, wall counts, stats counts).

## Visual language

- Two families: Inter Tight (grot) and JetBrains Mono (labels/metadata).
- Paper/ink warm palette, not neutral grey.
- Thin hairline rules (`--rule`, `--rule-strong`), sharp corners
  (`--radius: 0`). Artist photos are a deliberate exception (round).
- Every surface that can pull a colour from the current record does,
  through `--tint` + `--shadow` custom properties.
- `--hl` accent (crimson) for active states only; not for decoration.

## Navigation

- Drop Fuzzbox. Nav items mirror the actual route set:
  Home · Albums · Artists · Genres · Stats · Random · Wrapped.
- Search stays as an inline input in the top bar (desktop); mobile keeps
  the existing modal.
- Theme toggle stays in the nav (follows system by default).

## Now-spinning bar

Not built. Kept the surface quieter. Can revisit as a future enhancement
if we want a persistent Last.fm scrobble ticker.

## Tweaks panel

- Dev-only. Not exposed in the public nav.
- Opens on `Cmd+Shift+D` (mac) / `Ctrl+Shift+D` (elsewhere).
- Persists to `localStorage['russfm.tweaks']`.
- Public defaults are the locked-in values in `redesignConfig`.

## Routing

React Router DOM stays. No hash routing (the reference JSX in
`docs/project/Redesign/` uses hash routing purely because it runs as a
standalone demo).

## Theming

- Default: `system` (inherits from the existing ThemeProvider).
- Both paper (light) and ink (dark) palettes are first-class — contrast
  is audited for both.

## Cards & chips (Phase 3 decisions)

- `AlbumCard` no longer exposes a per-tile Last.fm scrobble dropdown. It
  was rarely-discovered hover chrome; scrobbling remains fully supported
  on the album detail page (`AlbumScrobbleButton` and the track-level
  scrobble UI).
- `AlbumCard` accepts an optional `index?: number`. When supplied, the
  tile renders a mono `CAT. NNN` badge top-left; walls and top-lists use
  this to surface rank.
- `ArtistCard` dropped the recent-albums avatar group hover. The editorial
  tile is intentionally quieter; dig-deeper flows happen on the artist
  detail page.

## Fonts

- Self-hosted via `@fontsource-variable/inter-tight` and
  `@fontsource-variable/jetbrains-mono` to avoid Google Fonts runtime
  fetches.
