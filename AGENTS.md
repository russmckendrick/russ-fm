# AGENTS.md

Agent guidance for `/Users/russ.mckendrick/Code/russ-fm`.

## Project Snapshot

- Full-stack music collection site: React 19 + TypeScript + Vite frontend, Rust backend in `scrapper/` (a TUI/CLI binary), static JSON output in `public/`.
- Package manager: `pnpm`
- Frontend data source: static files generated into `public/`; do not assume a live runtime API.

## Core Commands

- Frontend dev: `pnpm run dev`
- Frontend build: `pnpm run build`
- Fast build: `pnpm run build:fast`
- Lint: `pnpm run lint`
- Backend build + install (`scrapper` → `~/.cargo/bin`, registers `~/.config/scrapper/config.json` data root): `cd scrapper && ./install.sh`
- Backend dev build / lint: `cd scrapper && cargo build && cargo clippy`
- Backend collection run (from anywhere once installed): `scrapper collection --resume` (or `cd scrapper && cargo run -- collection --resume`)

## Universal Rules

- Update documentation whenever code changes land:
  - build or deployment changes: `docs/build-pipeline/`
  - frontend changes: `docs/frontend/`
  - backend changes: `docs/backend/`
  - API integration changes: `docs/api-integrations/`
- Preserve the static data contract between `scrapper/`, `public/`, and the frontend. Keep slugs, JSON shapes, and file paths aligned.
- For frontend images, always use helpers from `src/lib/image-utils.ts`. Never hardcode asset paths in components.
- Valid image sizes are `hi-res` and `medium` for album and artist artwork, plus `avatar` for artist avatars. Do not use `small`.
- Prefer updating existing docs instead of duplicating architecture or workflow detail in this file.

## Task Guides

- General architecture: [`docs/README.md`](./docs/README.md)
- Frontend: [`docs/frontend/README.md`](./docs/frontend/README.md)
- Frontend utilities, including image helpers: [`docs/frontend/utilities.md`](./docs/frontend/utilities.md)
- Backend: [`docs/backend/README.md`](./docs/backend/README.md)
- Data contracts and schemas: [`docs/data/README.md`](./docs/data/README.md)
- Build and deployment pipeline: [`docs/build-pipeline/README.md`](./docs/build-pipeline/README.md)
- API integrations: [`docs/api-integrations/README.md`](./docs/api-integrations/README.md)
- Development setup and troubleshooting: [`docs/development/README.md`](./docs/development/README.md)

## Notes

- The previous version of this file duplicated repo documentation and contained stale detail. Keep this root file short and move durable detail into the linked docs above.
