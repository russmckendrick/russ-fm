# Deployment

This document covers the CI/CD pipeline, Cloudflare R2 sync, and Workers deployment.

## Deployment Overview

```mermaid
flowchart TB
    subgraph GitHub["GitHub"]
        Push[Push to main]
        Actions[GitHub Actions]
    end

    subgraph Jobs["Parallel Jobs"]
        Assets[Assets Job]
        Deploy[Deploy Job]
    end

    subgraph Processing["Asset Processing"]
        Images[Process Images]
        Colors[Generate Colors]
        OG[Generate OG]
    end

    subgraph Cloudflare["Cloudflare"]
        R2[R2 Storage<br>assets.russ.fm]
        Workers[Workers<br>russ.fm]
        KV[KV Storage<br>Sessions]
    end

    Push --> Actions
    Actions --> Assets
    Actions --> Deploy

    Assets --> Images
    Images --> Colors
    Colors --> OG

    OG --> Deploy
    Deploy --> R2
    Deploy --> Workers
    Workers --> KV
```

## GitHub Actions Workflow

**File:** `.github/workflows/deploy.yml`

### Trigger

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - 'README.md'
```

### Jobs

#### Assets Job

```yaml
assets:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Install pnpm
      uses: pnpm/action-setup@v2
      with:
        version: 10

    - name: Cache assets
      uses: actions/cache@v4
      with:
        path: |
          node_modules/.cache/assets
        key: ${{ runner.os }}-assets-${{ hashFiles('pnpm-lock.yaml') }}-${{ hashFiles('scripts/**') }}

    - name: Install dependencies
      run: pnpm install

    - name: Process images
      run: pnpm run process-images -- --cache-dir node_modules/.cache/assets/images

    - name: Generate colors
      run: pnpm run generate-colors

    - name: Generate OG images
      run: pnpm run generate-og -- --cache-dir node_modules/.cache/assets/og
```

#### Deploy Job

```yaml
deploy:
  needs: assets
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0  # Full history for git diff

    - name: Setup Node.js & pnpm
      # ... same as assets job

    - name: Restore assets cache
      uses: actions/cache@v4
      # ... same cache config

    - name: Install dependencies
      run: pnpm install

    - name: Type check
      run: pnpm run tsc --noEmit

    - name: Build
      run: pnpm run vite build

    - name: Populate dist from cache
      run: |
        pnpm run process-images
        pnpm run generate-colors
        pnpm run generate-og

    - name: Detect changed files
      run: |
        git diff --name-only ${{ github.event.before }} HEAD > changed_files.txt

    - name: Sync to R2
      run: node scripts/sync-to-r2.js --force --changed-files changed_files.txt
      env:
        R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
        R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
        R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
        R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}

    - name: Deploy to Cloudflare
      run: pnpm run deploy
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

## Cloudflare R2 Sync

### Overview

Images are stored in Cloudflare R2 and served from `assets.russ.fm`.

### Sync Script

**File:** `scripts/sync-to-r2.js`

**Usage:**
```bash
# Sync all images
pnpm run build:sync

# Dry run (preview)
pnpm run build:sync:dry

# Sync only changed files
node scripts/sync-to-r2.js --changed-files changed_files.txt

# Sync specific types
node scripts/sync-to-r2.js --type album
node scripts/sync-to-r2.js --type artist
node scripts/sync-to-r2.js --size hi-res
node scripts/sync-to-r2.js --size medium

# Force overwrite
node scripts/sync-to-r2.js --force
```

### Changed File Detection

```javascript
// Parse git diff output
function getChangedTargets(changedFilesPath) {
  const changed = fs.readFileSync(changedFilesPath, 'utf-8')
    .split('\n')
    .filter(Boolean);

  const targets = new Set();

  for (const file of changed) {
    // Extract album/artist slugs
    const albumMatch = file.match(/public\/album\/([^/]+)/);
    const artistMatch = file.match(/public\/artist\/([^/]+)/);

    if (albumMatch) targets.add(`album/${albumMatch[1]}`);
    if (artistMatch) targets.add(`artist/${artistMatch[1]}`);
  }

  return [...targets];
}
```

### Upload Process

```javascript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

async function uploadFile(localPath, remotePath) {
  const fileStream = fs.createReadStream(localPath);
  const contentType = getContentType(localPath);

  const upload = new Upload({
    client,
    params: {
      Bucket: bucketName,
      Key: remotePath,
      Body: fileStream,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000'  // 1 year
    }
  });

  upload.on('httpUploadProgress', (progress) => {
    // Track progress
  });

  await upload.done();
}
```

### R2 Utilities

```bash
# List bucket contents
pnpm run r2:list

# Clean orphaned files
pnpm run r2:clean --confirm
```

---

## Cloudflare Workers

### Wrangler Configuration

**File:** `wrangler.toml`

```toml
name = "russ-fm"
compatibility_date = "2024-03-01"
main = "./_worker.js"

[assets]
directory = "./dist-worker"
binding = "ASSETS"

[[kv_namespaces]]
binding = "SESSIONS"
id = "826248011b2e42daa3052edb12763522"
preview_id = "b791af7209cd437f9ecef0155597f7bd"

[vars]
ENVIRONMENT = "production"
ALLOWED_ORIGINS_STRING = "https://russ.fm,https://preview.russ.fm"

[[routes]]
pattern = "russ.fm/*"
zone_name = "russ.fm"

[env.preview]
name = "russ-fm-preview"
route = "preview.russ.fm/*"

[env.production]
name = "russ-fm"
route = "russ.fm/*"
```

### Worker Build

**File:** `scripts/build-worker.js`

Optimizes build for Workers:

```javascript
// 1. Move images out of public temporarily
moveImages('public/album', '.temp-images/album');
moveImages('public/artist', '.temp-images/artist');

// 2. Build without images
execSync('pnpm vite build --outDir dist-worker');

// 3. Restore images
moveImages('.temp-images/album', 'public/album');
moveImages('.temp-images/artist', 'public/artist');

// 4. Copy JSON files to dist-worker
copyJsonFiles('public/album', 'dist-worker/album');
copyJsonFiles('public/artist', 'dist-worker/artist');

// 5. Copy collection.json and colors
copyFile('public/collection.json', 'dist-worker/collection.json');
copyFile('public/album-colors.json', 'dist-worker/album-colors.json');
```

### Worker Handler

**File:** `_worker.js`

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env);
    }

    // Static assets
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      return addCorsHeaders(asset);
    }

    // SPA fallback
    return env.ASSETS.fetch(new Request(new URL('/', url)));
  }
};

async function handleAPI(request, env) {
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/auth/')) {
    return handleAuth(request, env);
  }

  if (url.pathname.startsWith('/api/scrobble/')) {
    return handleScrobble(request, env);
  }

  return new Response('Not Found', { status: 404 });
}
```

---

## Environment Secrets

### Required Secrets

| Secret | Description |
|--------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `CLOUDFLARE_API_TOKEN` | Wrangler deploy token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |

### Setting Secrets

```bash
# GitHub CLI
gh secret set R2_ACCOUNT_ID --body "your-account-id"
gh secret set R2_ACCESS_KEY_ID --body "your-key"
gh secret set R2_SECRET_ACCESS_KEY --body "your-secret"
```

---

## Deployment Workflow

### Standard Deployment

1. Push to `main` branch
2. GitHub Actions triggers
3. Assets job processes images
4. Deploy job builds and deploys
5. Changed files synced to R2
6. Workers deployed

### Manual Deployment

```bash
# Build locally
pnpm run build

# Sync to R2
pnpm run build:sync

# Deploy to Workers
pnpm run deploy
```

### Preview Deployment

```bash
# Deploy to preview environment
pnpm run wrangler deploy --env preview
```

---

## Monitoring

### Deployment Status

Check GitHub Actions for build status:
```
https://github.com/russmckendrick/russ-fm/actions
```

### Cloudflare Dashboard

- **Workers:** Monitor requests, errors, CPU time
- **R2:** Storage usage, request metrics
- **Analytics:** Page views, geographic distribution

### Logs

```bash
# Worker logs
pnpm run wrangler tail

# Filtered logs
pnpm run wrangler tail --format json | jq '.logs[]'
```

---

## Rollback

### Revert Worker

```bash
# List deployments
pnpm run wrangler deployments list

# Rollback to previous
pnpm run wrangler rollback
```

### Revert R2 Assets

R2 doesn't have versioning enabled. To rollback:

1. Checkout previous commit
2. Run full sync: `pnpm run build:sync --force`

---

## Troubleshooting

### Build Failures

```bash
# Check TypeScript errors
pnpm run tsc --noEmit

# Verify build locally
pnpm run build
```

### R2 Sync Issues

```bash
# Dry run to check what would sync
pnpm run build:sync:dry

# Check R2 connectivity
node scripts/sync-to-r2.js --type album --size medium --dry-run
```

### Worker Deployment Issues

```bash
# Check wrangler auth
pnpm run wrangler whoami

# Validate config
pnpm run wrangler config validate
```
