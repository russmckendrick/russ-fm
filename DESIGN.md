---
version: "alpha"
name: russ.fm Editorial
description: Warm paper, dense catalogue typography, and album-art-led editorial surfaces for a personal record collection.
colors:
  primary: "#0E0D0B"
  primary-foreground: "#F4F1EA"
  secondary: "#EBE6DB"
  tertiary: "#E23B1E"
  surface: "#F4F1EA"
  surface-raised: "#FAF7EF"
  surface-recessed: "#E0D9C8"
  on-surface: "#0E0D0B"
  on-surface-muted: "#5A534A"
  on-surface-dim: "#8A8377"
  stage: "#080807"
  stage-2: "#11100D"
  stage-ink: "#F7F2E8"
  tint: "#8A8A3D"
  error: "#E23B1E"
typography:
  display-xl:
    fontFamily: "Archivo Variable"
    fontSize: 96px
    fontWeight: 760
    lineHeight: 0.92
    letterSpacing: 0em
    fontVariation: "'wdth' 62, 'wght' 760"
  headline-lg:
    fontFamily: "Archivo Variable"
    fontSize: 32px
    fontWeight: 760
    lineHeight: 1
    letterSpacing: 0em
    fontVariation: "'wdth' 62, 'wght' 760"
  headline-md:
    fontFamily: "Archivo Variable"
    fontSize: 22px
    fontWeight: 680
    lineHeight: 1.15
    letterSpacing: 0em
    fontVariation: "'wdth' 72, 'wght' 680"
  body-lg:
    fontFamily: "Archivo Variable"
    fontSize: 17px
    fontWeight: 480
    lineHeight: 1.68
    letterSpacing: 0em
    fontFeature: "'ss01', 'cv11'"
    fontVariation: "'wdth' 95, 'wght' 480"
  body-md:
    fontFamily: "Archivo Variable"
    fontSize: 15px
    fontWeight: 480
    lineHeight: 1.55
    letterSpacing: 0em
    fontFeature: "'ss01', 'cv11'"
    fontVariation: "'wdth' 95, 'wght' 480"
  label-md:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: 0.08em
  label-sm:
    fontFamily: "JetBrains Mono Variable"
    fontSize: 10.5px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: 0.12em
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 48px
  page-gutter: 32px
rounded:
  none: 0px
  sm: 2px
  md: 6px
  lg: 8px
  full: 9999px
components:
  page-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  editorial-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.xl}"
  editorial-card-raised:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.xl}"
  metadata-cell:
    backgroundColor: "{colors.surface-recessed}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  stage-panel:
    backgroundColor: "{colors.stage}"
    textColor: "{colors.stage-ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.xl}"
  stage-secondary-panel:
    backgroundColor: "{colors.stage-2}"
    textColor: "{colors.stage-ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.xl}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
    height: 40px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
    height: 40px
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
    height: 40px
  link-accent:
    textColor: "{colors.tertiary}"
    typography: "{typography.label-md}"
  decorative-mono:
    textColor: "{colors.on-surface-dim}"
    typography: "{typography.label-sm}"
  quiet-copy:
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body-md}"
  tint-swatch:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
    padding: "{spacing.sm}"
  error-state:
    backgroundColor: "{colors.error}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
---

## Overview

russ.fm is an editorial catalogue for a personal record collection: more archive index than streaming app, more printed music journal than glossy SaaS dashboard. The interface should feel warm, tactile, dense, and intentional, with album art carrying the visual emotion and the UI acting as a precise paper-and-ink frame. Core screens are quiet and systematic; feature moments can become more expressive through record sleeves, generated album palettes, and dark stage surfaces.

## Colors

- **Primary ink (#0E0D0B):** the core text color and solid action background in the light paper theme.
- **Paper surfaces (#F4F1EA, #EBE6DB, #FAF7EF, #E0D9C8):** warm off-whites and recessed papers, never neutral gray. Use these for body backgrounds, cards, metadata grids, filters, and empty states.
- **Highlight red (#E23B1E):** the single fixed accent. Use it for section numbers, active countdown strokes, active links, destructive states, and brief hover emphasis.
- **Muted ink (#5A534A, #8A8377):** secondary copy, mono catalogue labels, counts, decorative dividers, and low-priority metadata.
- **Stage tones (#080807, #11100D, #F7F2E8):** off-black presentation surfaces for stats, wrapped, and hero-like music moments. Avoid pure black.
- **Dynamic album color:** album palettes from `public/album-colors.json` and `public/album-colors.css` may override tint, shadow, hover-strip, and hero wash treatments. They should support the catalogue, not replace the paper/ink system.

## Typography

- **Display:** condensed Archivo Variable, uppercase, heavy, and tight. Use for album titles, browse headers, and section titles where the interface needs a printed-poster cadence.
- **Body:** Archivo Variable with a slightly narrow width and readable line height. Keep long descriptions around 64-68 characters where practical.
- **Labels:** JetBrains Mono Variable, uppercase, small, and tracked out. Use for counts, `CAT.`-style metadata, section numbers, filter labels, keyboard hints, and rail headings.
- **Hierarchy:** pair one large display phrase with small mono metadata rather than stacking many medium-weight headings.

## Layout

The core layout is a wide editorial canvas capped around `1640px`, with `20px` mobile gutters and `32px` desktop gutters. Pages use hairline rules, gridded metadata cells, divide-y catalogue lists, and drag-scroll walls rather than rounded dashboard panels. Dense catalogue screens should preserve scan speed: albums and artists sit in predictable grids, filters occupy a compact border-y row, and page headers establish `num · kicker · title · counts`.

Hero and detail compositions can go full-bleed, but they should still expose a structured information rail. Album art should usually be square, prominent, and anchored to real collection data.

## Elevation & Depth

Depth is restrained. Prefer hairline borders, tonal paper layers, and slight translate-on-hover motion before shadows. When shadows appear, they should usually come from album palettes, as in cover-color drop shadows and hero sleeve glows. Glass effects are reserved for presentation-style wrapped surfaces and should not become the default catalogue language.

## Shapes

Corners are mostly square: `--radius` is `0`, cards are sharp, nav controls are squared off, and metadata grids rely on hard edges. Rounded forms are reserved for objects that are naturally photographic or avatar-like: artist portraits may use `6px`, circular avatars use `9999px`, and pills appear only in presentation contexts where the surrounding surface already uses that vocabulary.

## Components

- **Navigation:** sticky paper bar, hairline bottom rule, icon-led links, active state as an underline rather than a filled tab. The brand lockup is uppercase condensed Archivo plus small mono descriptor text.
- **Buttons:** mono uppercase labels, square corners, solid ink for primary actions, red only on hover or urgent states. Icon buttons use the same border/rule language.
- **Search and filters:** compact, bordered, and joined to their overlays where possible. Use mono labels for filter categories and Archivo for entered values.
- **Album cards:** square cover first, then uppercase display title and mono subline. Hover metadata strips may use the album palette's `{background, foreground}` pair for guaranteed cover-aware contrast.
- **Artist cards:** quiet square portraits with slight rounding, mono rank, uppercase display name, and small release count.
- **Editorial primitives:** Dossier heroes, fact grids, rail sections, empty states, and skeletons should use paper layers, rule borders, small mono labels, and high-contrast ink text.
- **Wrapped and stats moments:** may use stage surfaces, full-bleed album imagery, and stronger motion, but should continue to derive color from music data and preserve readable rails.

## Do's and Don'ts

- Do use album artwork and extracted album colors as the emotional layer; keep navigation, filters, and catalogue scaffolding in paper and ink.
- Do keep red scarce: section numerals, active strokes, hover states, destructive feedback, and one primary emphasis per region.
- Do build dense grids and lists with hairline dividers, predictable gutters, and small mono metadata.
- Do use `src/lib/image-utils.ts` helpers for frontend album and artist images; keep valid sizes to `hi-res`, `medium`, and `avatar`.
- Don't introduce broad rounded cards, soft dashboard panels, or generic SaaS spacing into catalogue pages.
- Don't use pure black, pure white, or cool neutral gray as the base palette; the system is warm paper and warm ink.
- Don't let decorative mono labels overpower the record titles, artist names, or sleeve imagery.
- Don't hardcode album palette values in components; consume the generated static JSON/CSS contract.
