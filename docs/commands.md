# Available Commands

This project includes a variety of scripts in `package.json` to handle development, building, and maintenance.

## Development

-   `pnpm run dev`: Starts the Vite development server for the frontend.
-   `pnpm run dev:worker`: Starts the Cloudflare Worker development environment using Wrangler.
-   `pnpm run preview`: Builds the project and serves the production build locally.
-   `pnpm run lint`: Runs ESLint to check for code quality issues.

## Build

-   `pnpm run build`: Full production build. Cleans `dist`, type-checks, builds Vite app, and generates all assets (images, colors, OG).
-   `pnpm run build:fast`: Fast build without asset generation (JS/TS only).
-   `pnpm run build:worker`: Builds the frontend (fast) and then bundles the Worker script.
-   `pnpm run build:worker-cloudflare`: Specialized build script for Cloudflare environment.
-   `pnpm run build:wrapped`: Generates data for the "Wrapped" year-in-review feature.

## Asset Management

-   `pnpm run process-images`: Resizes and optimizes images from `/public` for production.
-   `pnpm run cleanup-images`: Removes unused generated images.
-   `pnpm run check-corrupted-images`: Scans for damaged image files.
-   `pnpm run generate-colors`: Extracts dominant colors from album artwork.
-   `pnpm run generate-og`: Generates Open Graph images for social sharing.

## Deployment & R2 Sync

-   `pnpm run deploy`: Builds the worker and deploys it to Cloudflare.
-   `pnpm run deploy:preview`: Deploys to the Cloudflare preview environment.
-   `pnpm run build:sync`: Syncs built assets to Cloudflare R2 storage.
-   `pnpm run build:sync:dry`: Dry run of the R2 sync to see what would change.
-   `pnpm run build:generate-sync`: Runs a full build and immediately syncs to R2.
-   `pnpm run r2:list`: Lists files currently in the R2 bucket.
-   `pnpm run r2:clean`: Cleans up orphaned files in the R2 bucket (requires confirmation).

## Maintenance

-   `pnpm run clear-cache`: Runs a shell script to clear local caches.
