# CLAUDE.md - Russ.fm Record Collection Showcase

This is a React + TypeScript + Vite application showcasing a record collection with modern UI components and comprehensive filtering capabilities.

## Project Overview

A Single Page Application (SPA) that displays a curated record collection with album and artist browsing, detailed views, search functionality, and pagination. Built with React 19, TypeScript, and shadcn/ui components.

## Technology Stack

- **Frontend**: React 19.1.0 with TypeScript
- **Build Tool**: Vite 7.0.0 with Fast Refresh
- **Styling**: Tailwind CSS 3.4.17 with custom design system
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Routing**: React Router DOM 7.6.3 (client-side routing)
- **Icons**: Lucide React + React Icons (for music service brands)
- **Data**: Static JSON files in public directory

## Common Commands

```bash
# Development
npm run dev              # Start development server (http://localhost:5173)

# Build
npm run build           # TypeScript compilation + Vite build (outputs to dist/)

# Code Quality
npm run lint            # Run ESLint
npm run preview         # Preview production build locally
```

## Project Structure

```
src/
├── components/
│   ├── ui/             # shadcn/ui components (Button, Card, Select, etc.)
│   ├── Navigation.tsx  # Top navigation with search
│   ├── AlbumCard.tsx   # Album display component
│   ├── FilterBar.tsx   # Filtering and sorting controls
│   └── ...
├── pages/
│   ├── AlbumsPage.tsx     # Main albums grid (home page)
│   ├── ArtistsPage.tsx    # Artists grid
│   ├── AlbumDetailPage.tsx # Individual album view
│   └── ArtistDetailPage.tsx # Individual artist view
├── config/
│   └── app.config.ts   # App configuration (pagination, features, external links)
├── lib/
│   └── utils.ts        # Utility functions (className merging)
└── main.tsx           # Application entry point

public/
├── collection.json     # Main collection data (29 albums)
├── album/             # Album data directories
│   └── [slug]/
│       ├── [slug].json        # Detailed album metadata
│       ├── [slug]-hi-res.jpg  # High resolution cover
│       ├── [slug]-medium.jpg  # Medium resolution cover
│       └── [slug]-small.jpg   # Small resolution cover
└── artist/            # Artist data directories
    └── [slug]/
        ├── [slug].json        # Detailed artist metadata
        ├── [slug]-hi-res.jpg  # High resolution image
        ├── [slug]-medium.jpg  # Medium resolution image
        └── [slug]-small.jpg   # Small resolution image
```

## Key Configuration Files

- **vite.config.ts**: Vite configuration with path aliases (`@` → `./src`)
- **src/config/app.config.ts**: Application settings (pagination: 20 albums, 24 artists per page)
- **tailwind.config.js**: Tailwind CSS configuration with custom design system
- **components.json**: shadcn/ui configuration file

## Data Structure

The application consumes JSON data from the public directory:

- **collection.json**: Main collection file with basic album metadata and URLs
- **album/[slug]/[slug].json**: Detailed album data with tracks, services, statistics
- **artist/[slug]/[slug].json**: Detailed artist data with discography, biography, services

## URL Structure

- `/` - Albums page (home)
- `/artists` - Artists page
- `/album/[album-slug]` - Album detail page
- `/artist/[artist-slug]` - Artist detail page

## Important Implementation Details

### Client-Side Routing
This is a SPA with React Router. Server must redirect all non-file requests to index.html for proper routing.

### Data Fetching
All data is fetched from static JSON files in the public directory using fetch() calls to root paths (e.g., `/collection.json`, not `/public/collection.json`).

### Image Handling
Multiple image sizes available: `-hi-res.jpg`, `-medium.jpg`, `-small.jpg`. Components use appropriate sizes based on context.

### Pagination
Configurable via `src/config/app.config.ts`:
- Albums: 20 per page
- Artists: 24 per page
- Page numbers shown: 5 before ellipsis

### Search & Filtering
Real-time search across:
- Album titles, artists, genres
- Multiple sort options: date added, name, year, album count
- Genre filtering with dynamic badge display

### Error Handling
Comprehensive fallback systems for missing data:
- Album tracklists fall back to service APIs
- Missing images use placeholder or first available size
- Service URLs checked across multiple data sources

## Known Technical Considerations

### Build Issues Previously Resolved
1. **PostCSS ES Module Error**: Fixed by using `export default` instead of `module.exports`
2. **Path Alias Issues**: Resolved with proper Vite configuration for `@` alias
3. **Select Component Empty Values**: Fixed by using "all" instead of empty strings
4. **Double URL Prefixes**: Resolved by removing redundant path segments

### Dependencies Note
- Uses Tailwind CSS v3 (not v4) for better shadcn/ui compatibility
- React 19 with TypeScript for modern React features
- No test framework currently configured

## Deployment

Built files output to `dist/` directory. See DEPLOYMENT.md for server configuration examples for SPA routing support.

## Common Development Tasks

When adding new features:
1. Check existing patterns in similar components
2. Use existing UI components from `src/components/ui/`
3. Follow TypeScript interfaces and data structures
4. Update `src/config/app.config.ts` for new configuration options
5. Test with real data from public directory JSON files

When debugging:
1. Check browser network tab for failed JSON requests
2. Verify image paths match actual file structure
3. Ensure client-side routing is working correctly
4. Check console for TypeScript errors

This application demonstrates modern React development with TypeScript, comprehensive data handling, and a well-organized component architecture.