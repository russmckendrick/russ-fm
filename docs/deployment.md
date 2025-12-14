# Deployment & CI/CD

This project uses a fully automated deployment pipeline powered by **GitHub Actions** and **Cloudflare**, designed for high performance and minimal maintenance.

## Pipeline Overview

All changes pushed to the `main` branch trigger the deployment workflow (`.github/workflows/deploy.yml`).

### Workflow Steps

1.  **Preparation** (`Job: assets`):
    -   **Checkout**: Retrieves source code.
    -   **Cache**: Restores `pnpm` store and `node_modules/.cache/assets` (critical for build speed).
    -   **Install**: Installs dependencies via `pnpm`.

2.  **Asset Processing** (`Job: assets`):
    -   **Optimization**: Runs `pnpm run process-images` to resize and compress any new images in `/public`.
    -   **Color Extraction**: Runs `pnpm run generate-colors` to extract dominant colors from album art for UI theming.
    -   **OG Images**: Runs `pnpm run generate-og` to create Open Graph share images for all pages.
    -   *Impact*: All these artifacts are cached for the next job.

3.  **Build** (`Job: deploy`):
    -   **Compile**: Runs `tsc` and `vite build`.
    -   **Populate**: Re-runs asset scripts to pull generated assets from cache into the `dist` folder.
    -   **Diff**: Detects changed files using `git diff` against the previous commit.

4.  **Sync** (`Job: deploy`):
    -   **Smart Upload**: Uploads **only changed files** to Cloudflare R2 storage using `scripts/sync-to-r2.js`.
    -   **Efficiency**: Saves bandwidth and time by skipping unchanged assets.

5.  **Deploy** (`Job: deploy`):
    -   **Publish**: Deploys the Worker code to Cloudflare Workers using `wrangler`.

## Cloudflare R2 Integration

We use Cloudflare R2 as a cost-effective, AWS S3-compatible object storage for hosting the static assets (images, JSON, JS/CSS).

### Sync Script

The core of the deployment is `scripts/sync-to-r2.js`. This script is intelligent:
-   It calculates MD5 hashes of local files.
-   It compares them with R2 inventory.
-   It uploads only modified or new files.

### Manual Sync Commands

You can manually trigger sync operations if needed:

```bash
# Sync all build assets
pnpm run build:sync

# Dry run (see what would change)
pnpm run build:sync:dry

# Sync specific asset types from source
node scripts/sync-to-r2.js --type album
node scripts/sync-to-r2.js --size hi-res
```

## Environment Variables

The following secrets must be configured in your GitHub Repository Settings:

| Variable | Description |
| copy | --- |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | R2 API Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API Secret |
| `R2_BUCKET_NAME` | Target R2 Bucket Name (e.g., `russ-fm-assets`) |
| `CLOUDFLARE_API_TOKEN` | Token for Workers Deployment |

## Production Verification

After deployment, verify the site:
1.  Visit the live URL.
2.  Check the "Last Updated" footer (if implemented) or check console for build version.
3.  Verify new album images load correctly (CDN cache may take a minute).
