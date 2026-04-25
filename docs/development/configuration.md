# Configuration Reference

This document covers all configuration options for both frontend and backend.

## Frontend Configuration

### App Config (`src/config/app.config.ts`)

```typescript
export const appConfig = {
  // Pagination settings
  pagination: {
    itemsPerPage: {
      albums: 20,
      artists: 24
    },
    showPageNumbers: 5
  },

  // Feature flags
  features: {
    enableSearch: true,
    enableFilters: true,
    enableSorting: true
  },

  // Homepage settings
  homepage: {
    hero: {
      numberOfFeaturedAlbums: 6,
      autoRotateInterval: 12000  // 12 seconds
    },
    recentlyAdded: {
      displayCount: 12
    },
    eras: {
      excludedDecades: [1930]
    },
    randomCollection: {
      displayCount: 12
    },
    randomArtists: {
      displayCount: 12
    },
    sectionOrder: [
      'hero',
      'recentAlbums',
      'recentArtists',
      'genres',
      'randomCollection',
      'randomArtists'
    ]
  },

  // URLs
  siteUrl: 'https://russ.fm',

  // Asset configuration
  assets: {
    baseUrl: 'https://assets.russ.fm',  // Production only
    useR2: true,  // Use R2 in production
    fallbackUrl: ''  // Local fallback
  },

  // External service URLs
  external: {
    discogs: 'https://www.discogs.com',
    spotify: 'https://open.spotify.com',
    appleMusic: 'https://music.apple.com',
    lastfm: 'https://www.last.fm'
  },

  // Footer configuration
  footer: {
    links: {
      about: '/about',
      explore: ['/albums', '/artists', '/genres'],
      external: ['discogs', 'spotify', 'lastfm']
    },
    copyright: {
      year: 2024,
      holder: 'Russ McKendrick'
    }
  }
};

// Type-safe getter
export function getConfig<K extends keyof typeof appConfig>(
  key: K
): typeof appConfig[K] {
  return appConfig[key];
}
```

`homepage.eras.excludedDecades` is applied by the home `StatsAside`
overview when calculating its record total, decade bars, genre bars, and
yearly additions timeline. The displayed decade span still reflects the
full collection.

### Usage

```typescript
import { appConfig, getConfig } from '@/config/app.config';

// Direct access
const itemsPerPage = appConfig.pagination.itemsPerPage.albums;

// Type-safe getter
const pagination = getConfig('pagination');
```

---

### Vite Config (`vite.config.ts`)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // Custom image processing middleware for dev
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },

  build: {
    outDir: 'dist',
    sourcemap: false,

    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            // ... other Radix components
          ],
          'animation-vendor': ['framer-motion'],
          'chart-vendor': ['d3', 'recharts'],
          'utils-vendor': ['fuse.js', 'clsx', 'tailwind-merge']
        }
      }
    },

    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },

    cssCodeSplit: true
  },

  server: {
    port: 5173,
    fs: {
      strict: false
    }
  },

  preview: {
    port: 4173
  }
});
```

---

### Environment Variables

#### Development

```bash
# .env (optional for dev)
VITE_SCROBBLING_ENABLED=true
```

#### Production

```bash
# .env.production
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=russ-fm-assets
R2_PUBLIC_DOMAIN=https://assets.russ.fm
```

---

## Backend Configuration

### Config File (`scrapper/config.json`)

```json
{
  "discogs": {
    "access_token": "YOUR_PERSONAL_ACCESS_TOKEN",
    "username": "YOUR_DISCOGS_USERNAME",
    "rate_limit": 60
  },

  "apple_music": {
    "key_id": "YOUR_KEY_ID",
    "team_id": "YOUR_TEAM_ID",
    "private_key_path": "/path/to/AuthKey.p8",
    "storefront": "us",
    "rate_limit": 1000
  },

  "spotify": {
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "market": "US",
    "rate_limit": 100
  },

  "lastfm": {
    "api_key": "YOUR_API_KEY",
    "shared_secret": "YOUR_SHARED_SECRET",
    "username": "YOUR_USERNAME",
    "rate_limit": 60
  },

  "perplexity": {
    "api_key": "YOUR_API_KEY",
    "model": "sonar",
    "rate_limit": 20
  },

  "wikipedia": {
    "language": "en",
    "user_agent": "MusicCollectionManager/1.0 (https://russ.fm)"
  },

  "TheAudioDB": {
    "api_token": "2",
    "base_url": "https://theaudiodb.com/api/v1/json/"
  },

  "database": {
    "path": "collection_cache.db"
  },

  "logging": {
    "level": "INFO",
    "file": "logs/music_collection_manager.log",
    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
  },

  "processing": {
    "batch_size": 10,
    "retry_attempts": 3,
    "retry_delay": 5,
    "concurrent_requests": 1
  },

  "data": {
    "path": "../public"
  }
}
```

### Configuration Sections

#### discogs

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| access_token | string | - | Personal access token |
| username | string | - | Discogs username |
| rate_limit | int | 60 | Requests per minute |

#### apple_music

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| key_id | string | - | MusicKit key ID |
| team_id | string | - | Apple Developer team ID |
| private_key_path | string | - | Path to .p8 key file |
| storefront | string | "us" | Market code |
| rate_limit | int | 1000 | Requests per hour |

#### spotify

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| client_id | string | - | Spotify app ID |
| client_secret | string | - | Spotify app secret |
| market | string | "US" | Market code |
| rate_limit | int | 100 | Requests per minute |

#### lastfm

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| api_key | string | - | Last.fm API key |
| shared_secret | string | - | Shared secret (for auth) |
| username | string | - | Last.fm username |
| rate_limit | int | 60 | Requests per minute |

#### perplexity

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| api_key | string | - | Perplexity API key |
| model | string | "sonar" | AI model to use |
| rate_limit | int | 20 | Requests per minute |

#### database

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| path | string | "collection_cache.db" | SQLite file path |

#### logging

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| level | string | "INFO" | Log level |
| file | string | "logs/..." | Log file path |
| format | string | - | Log format string |

#### processing

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| batch_size | int | 10 | Items per batch |
| retry_attempts | int | 3 | Max retries |
| retry_delay | int | 5 | Seconds between retries |
| concurrent_requests | int | 1 | Parallel requests |

---

### Environment Variable Overrides

Configuration can be overridden with environment variables:

```bash
# Prefix with service name in uppercase
export DISCOGS_ACCESS_TOKEN="your_token"
export APPLE_MUSIC_KEY_ID="your_key_id"
export SPOTIFY_CLIENT_ID="your_client_id"
export LASTFM_API_KEY="your_api_key"
export PERPLEXITY_API_KEY="your_api_key"
```

---

## Wrangler Configuration

### wrangler.toml

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

---

## Tailwind Configuration

### tailwind.config.js

```javascript
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: 'hsl(var(--primary))',
        secondary: 'hsl(var(--secondary))',
        muted: 'hsl(var(--muted))',
        accent: 'hsl(var(--accent))',
        // ... more colors
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: [
    require('tailwindcss-animate')
  ]
};
```

---

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## ESLint Configuration

### eslint.config.js

```javascript
export default [
  {
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  }
];
```

---

## Related Documentation

- [Development Guide](./README.md)
- [Troubleshooting](./troubleshooting.md)
- [Build Pipeline](../build-pipeline/)
