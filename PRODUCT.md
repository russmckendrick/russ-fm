# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Russ McKendrick, the collector-owner: checks his own collection, shows it to people, decides what to spin next.
- Visiting music fans and fellow collectors who land on russ.fm to browse what Russ owns, not to buy anything.

## Product Purpose

russ.fm is the public face of a real, physical record collection (~3,300 records, ~1,215 artists). It exists to represent the shelves — the owned objects and the history of collecting them — not to sell or stream music. Success: a visitor immediately understands "this is one person's physical collection" and enjoys digging through it. Confirmed 2026-08-08: the experience should feel like browsing the shelves first, backed by collector's-journal provenance (dates added, growth, pressing details) and listening context (scrobbles, what to spin next). It must stop reading like an ecommerce/streaming product page.

## Positioning

Every item on the site is a record Russ physically owns, with real provenance (date added, pressing/label/format from Discogs) and real listening history (Last.fm scrobbles). No store could truthfully present this: it is an owned collection, complete and finite, with a timeline of acquisition.

## Capabilities & Constraints

- Static site: React SPA (Vite + React Router + Tailwind) fed entirely by files generated into `public/` by the Rust `scrapper` (collection.json, per-album and per-artist detailed JSON, album-colors.json/css). No runtime API; the static data contract (slugs, JSON shapes, file paths) is fixed.
- Images only via `src/lib/image-utils.ts` helpers; valid sizes `hi-res`, `medium` (album + artist) and `avatar` (artist). Production images served from assets.russ.fm.
- Integrations: Last.fm scrobbling, Spotify/Apple Music embeds, Discogs links. Confirmed 2026-08-08: these may be demoted to quiet links; sections, stats sidebar and hero may all be restructured.
- Deployed on Cloudflare (wrangler); keep static-render friendliness and SEO meta/JSON-LD behaviour.

## Terminology

"Records", "collection", "shelves", "added" (date a record entered the collection). Avoid store vocabulary (product, buy, shop, price).
