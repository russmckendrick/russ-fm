---
version: "alpha"
name: The Listening Room (Daylight)
description: A daylit hi-fi deck — warm paper-aluminium panels, ink silkscreen, flat controls, one amber accent; the records are the only colour. Night mode behind a switch.
colors:
  ground: "#F1EEE7"
  panel: "#F7F5EE"
  panel-recessed: "#EAE6DB"
  well: "#E5E0D3"
  deep: "#DCD6C8"
  ink: "#211F1B"
  ink-muted: "#56524A"
  ink-dim: "#837D71"
  hairline: "#D9D4C8"
  hairline-strong: "#C3BEB0"
  amber: "#A86A0E"
  amber-light: "#E39A2D"
  meter-red: "#C04220"
  vu-face: "#F4E9CD"
  vu-ink: "#3D3527"
  error: "#C04220"
  night-ground: "#1B1A18"
  night-panel: "#232120"
  night-ink: "#EAE6DC"
  night-amber: "#F2A93B"
typography:
  plate-lg:
    fontFamily: "Michroma"
    fontSize: 28px
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: 0.06em
  plate-sm:
    fontFamily: "Michroma"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0.14em
  display-xl:
    fontFamily: "Saira"
    fontSize: 72px
    fontWeight: 640
    lineHeight: 0.98
    letterSpacing: 0.005em
    fontVariation: "'wdth' 85, 'wght' 640"
  headline-md:
    fontFamily: "Saira"
    fontSize: 22px
    fontWeight: 560
    lineHeight: 1.12
    letterSpacing: 0.02em
    fontVariation: "'wdth' 92, 'wght' 560"
  silkscreen-label:
    fontFamily: "Saira"
    fontSize: 10.5px
    fontWeight: 580
    lineHeight: 1.1
    letterSpacing: 0.2em
    fontVariation: "'wdth' 100, 'wght' 580"
  body-md:
    fontFamily: "Saira"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.62
    letterSpacing: 0.01em
    fontVariation: "'wdth' 96, 'wght' 400"
  readout-md:
    fontFamily: "Fragment Mono"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0.04em
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 56px
  page-gutter: 32px
rounded:
  none: 0px
  machined: 3px
  soft: 6px
  dial: 9999px
components:
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.machined}"
    padding: "{spacing.xl}"
  recessed-well:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.readout-md}"
    rounded: "{rounded.soft}"
    padding: "{spacing.lg}"
  silkscreen-heading:
    textColor: "{colors.ink}"
    typography: "{typography.silkscreen-label}"
  key-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.silkscreen-label}"
    rounded: "{rounded.machined}"
    padding: "{spacing.md}"
    height: 42px
  nav-key:
    textColor: "{colors.ink-muted}"
    typography: "{typography.silkscreen-label}"
    rounded: "{rounded.none}"
  quiet-copy:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-md}"
  readout:
    textColor: "{colors.ink-muted}"
    typography: "{typography.readout-md}"
---

## Overview

russ.fm is a real, finite, physical record collection. The Listening Room renders the site as the equipment and shelves that hold it — but in daylight: a Braun-style deck on a sunny sideboard, not a midnight rack. Warm paper-aluminium panels, ink silkscreen, hairline rules, flat machined controls. **The records are the only colour**: every record appears as a physical object — a sleeve with board edges and a disc with a real centre label, slid out sideways — never as a flat product tile. Provenance reads as spec plates and archive readouts; listening history reads as cream VU meters, fader banks, and LED levels. Night mode is the same room with the lamp off, available behind a day/night switch; day is the default.

## Colors

- **Daylight papers (#F1EEE7, #F7F5EE, #EAE6DB, #E5E0D3, #DCD6C8):** warm paper-aluminium layers — ground, panel, recessed band, well, deep. Never cool gray, never pure white.
- **Ink (#211F1B / #56524A / #837D71):** silkscreen ink at three intensities. #837D71 is decorative engraving only; data-bearing text uses #56524A or darker.
- **Amber (#A86A0E text · #E39A2D as light):** the single interface accent — active-source underlines, armed labels, LED dots, primary-key hover. Scarce.
- **Meter red (#C04220):** VU red zones and destructive states only.
- **Instrument materials are intrinsic:** cream VU faces (#F4E9CD), dark odometer drums, and black vinyl keep their real-world material in both themes.
- **Night tokens (#1B1A18 ground, #232120 panel, #EAE6DC ink, #F2A93B amber):** the dark variant behind the switch; identical grammar, lamp off, subtle LED glow allowed there only.
- **Album colour:** sleeves and disc centre labels carry the palette from `public/album-colors.json`; the interface never borrows it.

## Typography

- **Michroma** — plates only: the RUSS.FM lockup and rare engraved titles. Sparse.
- **Saira** (variable width) — silkscreen labels (caps, tracked 0.18–0.26em), display headings (width 85–92, weight 560–640), body (width 96).
- **Fragment Mono** — readouts and data: catalogue numbers, dates, durations, counts, positions. Never as decoration.

## Layout

Full-width horizontal bands, each with a silkscreen heading row (`LABEL ─── rule ─── mono readout`), capped at 1560px. Bands separate with a single hairline pair, and alternate ground/recessed paper. Records sit on rails — rows of gently leaning sleeves (±1.8–2.2°) with mono tickets — or lie in the platter well with the disc slid out sideways, always horizontally, never dropping below the sleeve.

## Elevation & Depth

Flat first. Hairlines and paper-tone changes do the layering; shadows exist only under physical objects (sleeves, discs, fader thumbs) and are soft, warm, and small. No bevels, no gradients on controls, no glass, no glow in daylight. Night mode may add a restrained LED glow to active dots only.

## Shapes

Machined but quiet: 3px on panels, keys and wells (6px for search/platter well), full circles for discs, LED dots, and portrait windows. The vinyl disc is a first-class component: CSS grooves, palette-coloured centre label with title and `33⅓ RPM · STEREO` ring text, spindle hole. Coloured pressings (e.g. lava red) render as their real material.

## Components

- **Navigation:** paper rail — RUSS.FM plate, plain-text source links with a small LED dot, amber underline on the active source, search well, and the day/night switch (sun/moon, persisted).
- **Record object:** sleeve (cover image, board edge, seam shadow, hairline outline) with optional slid-out disc; rack rows lean alternately and rest on a hairline rail. Every sleeve carries a mono ticket.
- **Spec plate / archive readout:** hairline-ruled key–value grids; silkscreen caps keys, mono values.
- **Meters:** cream VU faces with real values; ink fader thumbs on light slots; amber LED bar timelines. All instrument data is real.
- **Controls:** primary actions are flat ink keys (amber on hover); genre source-select is an underlined key list with counts; scrobble is a flat arm switch; service links are rear-panel jack labels, never coloured brand buttons.
- **Liner notes:** ≤68ch body beside an archive readout plate, never a lone half-empty band.

## Do's and Don'ts

- Do keep all chroma in the records: covers, disc labels, coloured pressings, artist photos. The interface stays paper, ink, and one amber.
- Do render records as objects with edges, thickness, lean, and shadow; the disc slides out sideways, horizontally.
- Do express data as instrumentation with real values and mono readouts.
- Do use collection vocabulary: filed, pulled, on the platter, in the rack; never buy/shop/product framing.
- Don't ship gradient buttons, bevels, inset-glow panels, or dark-dashboard chrome; daylight is flat and calm.
- Don't let amber spread: one active state per region; red only in meter zones and destructive states.
- Don't invent hardware fictions (model numbers, fake serials); the site is a collection, not a gadget.
- Don't hardcode album palette values; consume `public/album-colors.json` / `album-colors.css`.
