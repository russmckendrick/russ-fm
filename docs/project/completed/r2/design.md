# Cloudflare R2 Image Storage Design

## Overview

This document outlines the technical design for migrating image assets from local storage to Cloudflare R2, while keeping JSON data files with the application. The key insight is that image processing (resizing, optimization) is handled by the npm build process, not the Python backend.

## Current Architecture

### Data Collection & Build Flow
```
1. Python Backend → Downloads raw data + images → Saves to /public/
2. npm run build → Processes/resizes images → Outputs to /dist/
3. Frontend → References images via relative paths in /dist/
```

### Image Processing
- **Python**: Downloads original images only
- **Build Process**: Handles all image resizing (hi-res, medium, small)
- **Output**: Processed images in `/dist/album/` and `/dist/artist/`

## Proposed Architecture

### Updated Build Flow
```
1. Python Backend → Downloads raw data + images → Saves to /public/
2. npm run build → Processes/resizes images → Outputs to /dist/
3. npm run build:sync → Uploads processed images from /dist/ to R2
4. Frontend → References images via R2 URLs (https://assets.russ.fm)
```

### Storage Strategy
- **R2 Storage**: All processed image files from `/dist/`
- **Application Bundle**: JSON data files and React app only
- **CDN**: R2 assets served via https://assets.russ.fm

## Implementation Design

### Build Process Integration

#### 1. R2 Upload Module
Create a Node.js module for R2 operations:
```javascript
// scripts/r2-upload.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

class R2Uploader {
  constructor(config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async uploadDirectory(localDir, r2Prefix) {
    // Recursively upload all files from localDir to R2
  }
}
```

#### 2. Build Scripts ✅ IMPLEMENTED
```json
{
  "scripts": {
    "build": "tsc --noEmit && vite build && npm run process-images",
    "build:generate-sync": "npm run build && npm run build:sync",
    "build:sync": "node scripts/sync-to-r2.js",
    "build:sync:dry": "node scripts/sync-to-r2.js --dry-run",
    "build:worker": "npm run build && node scripts/cleanup-for-worker.js"
  }
}
```

**Status**: ✅ All scripts implemented with ES module support and comprehensive CLI options.

#### 3. Implementation Status ✅ COMPLETED

**R2 Upload System**: Complete with progress tracking, error handling, and CLI options
- ✅ S3-compatible client with AWS SDK v3
- ✅ Batch uploads with parallel processing
- ✅ Real-time progress tracking with ETA
- ✅ Comprehensive filtering (--type, --size, --filter)
- ✅ Dry-run mode for safe testing

**Worker Cleanup Script**: Fixed to preserve JSON files
- ✅ Selective image removal (preserves .json files)
- ✅ Directory structure maintained for routing
- ✅ 86% size reduction for Workers deployment
- ✅ Detailed reporting of removed/preserved files

**ES Module Conversion**: All scripts compatible with project setup
- ✅ Converted from CommonJS to ES modules
- ✅ Fixed import/export syntax across all files
- ✅ Module detection and path resolution working

**Testing Results**:
- ✅ 12,666 images ready for R2 upload (1.62 GB)
- ✅ 4,221 JSON files preserved for Workers
- ✅ All CLI features functional and tested

### Frontend Changes ✅ COMPLETED

#### 1. Configuration ✅ IMPLEMENTED
```typescript
// src/config/app.config.ts
export const appConfig = {
  // ... existing config
  assets: {
    baseUrl: import.meta.env.PROD ? 'https://assets.russ.fm' : '',
    useR2: import.meta.env.PROD, // Only use R2 in production
    fallbackUrl: '/fallback-image.jpg'
  }
}
```

**Status**: ✅ Automatic environment detection implemented. No manual configuration required.

#### 2. Image URL Resolution ✅ IMPLEMENTED
```typescript
// src/lib/image-utils.ts
export function getAlbumImageFromData(uriRelease: string, size: ImageSize = 'medium'): string {
  const slug = getAlbumSlug(uriRelease);
  return getAlbumImageUrl(slug, size);
}

export function getArtistImageFromData(uriArtist: string, size: ImageSize = 'medium'): string {
  const slug = getArtistSlug(uriArtist);
  return getArtistImageUrl(slug, size);
}

function getImageUrl(relativePath: string): string {
  return appConfig.assets.useR2 
    ? `${appConfig.assets.baseUrl}/${relativePath}`
    : `/${relativePath}`;
}
```

**Status**: ✅ Complete image utilities with slug extraction, environment detection, and error handling.

#### 3. Component Updates ✅ COMPLETED
All 11 React components updated to use R2-aware utilities:

**Core Components**:
- ✅ `AlbumCard.tsx` - Album grid displays
- ✅ `ArtistCard.tsx` - Artist grid displays  
- ✅ `SearchOverlay.tsx` - Search result images
- ✅ `AlbumModal.tsx` - Modal popup images

**Page Components**:
- ✅ `AlbumDetailPage.tsx` - Hero images and album art
- ✅ `ArtistDetailPage.tsx` - Artist profiles and hi-res images
- ✅ `GenrePage.tsx` - Mind map artist avatars
- ✅ `StatsPage.tsx` - Statistics page image displays
- ✅ `RandomPage.tsx` - Random album/artist images
- ✅ `SearchResultsPage.tsx` - Search result construction  
- ✅ `ArtistsPage.tsx` - Artist data processing

**Implementation Pattern**:
```typescript
// Before (direct property access)
src={album.images_uri_release.medium}

// After (R2-aware utility)
src={getAlbumImageFromData(album.uri_release, 'medium')}
```

**Benefits**:
- ✅ **Automatic Environment Switching**: Development uses local images, production uses R2 CDN
- ✅ **Consistent Error Handling**: Centralized fallback logic across all components
- ✅ **Type Safety**: Full TypeScript support for all image operations
- ✅ **No Breaking Changes**: Development workflow unchanged

### Build Pipeline Updates

#### 1. Environment Variables
```bash
# .env (production build only)
R2_ACCOUNT_ID=340899c6dee19f5cb584faed64885ffc
R2_ACCESS_KEY_ID=xxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxx
R2_BUCKET_NAME=russ-fm-assets
R2_PUBLIC_DOMAIN=https://assets.russ.fm

# No VITE_ variables needed - dev/prod determined automatically
```

#### 2. Build Optimization for Cloudflare Workers
- Standard build: `npm run build` - includes all files
- Worker build: `npm run build:worker` - excludes images, only JSON
- Post-build cleanup script removes `/dist/album/` and `/dist/artist/` directories
- Deploy only HTML, JS, CSS, and JSON files to Cloudflare Workers
- Images served exclusively from R2/CDN

## Benefits

1. **Separation of Concerns**: Build process remains unchanged, R2 sync is additive
2. **Flexibility**: Easy to disable R2 for local development
3. **Performance**: CDN delivery without changing build pipeline
4. **Cost**: Reduced hosting bandwidth
5. **Simplicity**: No changes to Python backend needed

## Migration Strategy

### Phase 1: Parallel Deployment
1. Keep existing build process unchanged
2. Add R2 sync as post-build step
3. Deploy with environment flag to test

### Phase 2: Production Switch
1. Enable R2 URLs in production
2. Monitor performance and costs
3. Remove local images from deployment

### Phase 3: Cleanup
1. Update deployment scripts to exclude images
2. Reduce server storage requirements
3. Document new workflow

## Development Workflow

### Local Development (Always Local)
```bash
# Development server (uses local images from /public/)
npm run dev

# Development uses existing Vite dev server
# Images served from /public/ directory
# No R2 integration needed for development
```

### Production Build
```bash
# Build and sync to R2 (production only)
npm run build:generate-sync

# Just sync existing build to R2
npm run build:sync

# Build for Cloudflare Workers (no images)
npm run build:worker
```

## Error Handling

### Frontend Fallbacks
- Detect failed image loads
- Fallback to local path if R2 fails
- Use placeholder image as last resort

### Build Process
- Validate R2 credentials before sync
- Provide clear error messages
- Allow partial sync with resume capability

## Future Enhancements

1. **Build-time Optimization**
   - WebP conversion during build
   - AVIF format for supported browsers
   - Automatic cache busting with hashes

2. **Smart Sync**
   - Only upload changed images
   - Parallel upload for speed
   - Progress reporting

3. **CDN Features**
   - Custom transforms via Cloudflare Workers
   - Geographic routing optimization
   - Analytics integration