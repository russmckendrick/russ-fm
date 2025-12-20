# Vinyl Wrapped Feature Proposal

## Overview

This proposal outlines the implementation of a **Vinyl Wrapped** feature for RussFM, creating annual retrospectives of Russ's vinyl collection using a modern bento grid design. The feature will transform the rich collection data into engaging, visual stories about the collecting journey each year.

## Data Architecture

### Current Data Sources
- **Main Collection**: `/public/collection.json` - Contains all releases with basic metadata
- **Detailed Album Data**: `/public/album/{slug}/{slug}.json` - Rich album information including images, genres, styles, formats
- **Artist Data**: `/public/artist/{slug}/{slug}.json` - Artist biographies, images, and metadata

### Proposed Data Generation

#### 1. Annual JSON Generation Script
**Location**: `/scripts/generate-wrapped-data.ts`

**Functionality**:
- Parse main `collection.json` and group releases by `date_added` year
- Enrich each release with detailed album and artist data
- Calculate comprehensive statistics per year
- Generate optimized JSON files: `/public/wrapped/wrapped-{year}.json`
- Generate live "year to date" data: `/public/wrapped/wrapped-ytd.json` (updated regularly)

**Generated Statistics**:
- **Collection Metrics**: Total releases, monthly breakdown, acquisition patterns
- **Genre Analysis**: Most collected genres/styles, diversity metrics
- **Artist Insights**: Most collected artists, new vs. familiar artists
- **Format Details**: Vinyl variants, special editions, reissues
- **Timeline Data**: First/last additions, peak collecting months
- **Visual Assets**: Top album covers (square format), artist images for display

#### 2. Data Structure Example
```json
{
  "year": 2024,
  "isYearToDate": false, // true for current year in progress
  "lastUpdated": "2024-12-31T23:59:59Z", // for YTD tracking
  "summary": {
    "totalReleases": 47,
    "uniqueArtists": 38,
    "topGenre": "Rock",
    "topStyle": "Alternative Rock",
    "avgPerMonth": 3.9,
    "peakMonth": "March",
    "firstAddition": "2024-01-15",
    "lastAddition": "2024-12-20",
    "projectedTotal": 56 // only for YTD, based on current pace
  },
  "releases": [...], // Full release data with enriched metadata
  "insights": {
    "genres": [...],
    "artists": [...],
    "formats": [...],
    "timeline": [...]
  }
}
```

## User Interface Design

### Route Structure
- **Default**: `/wrapped` - Redirects to previous year (e.g., 2024 in 2025)
- **Annual View**: `/wrapped/{year}` - Detailed year retrospective
- **Year to Date**: `/wrapped/ytd` - Current year progress (live data)

### Design System Integration
Following the modern design principles from `/design.md`:
- **Color Palette**: Strategic use of accent colors for visual hierarchy
- **Typography**: Clear hierarchical structure with proper contrast
- **Card System**: Elevated surfaces with proper depth and layering
- **Responsive Design**: Mobile-first approach with adaptive layouts

### Bento Grid Layout

#### Grid Structure (Desktop)
```
┌─────────────┬───────┬───────┐
│ Top Albums  │ Total │ Peak  │
│ (3x2 grid)  │ Count │ Month │
├─────────────┼───────┼───────┤
│ Genre Dist. │ Album │ Avg/  │
│ (Chart)     │ Cover │ Month │
├─────────────┼───────┼───────┤
│ Top Artists │ Album │ Format│
│ (2x2 grid)  │ Cover │ Types │
└─────────────┴───────┴───────┘
```

#### Bento Components

1. **Top Albums Grid** (Large)
   - 3x2 grid of square album covers with hover effects
   - Click-through to album detail pages
   - Overlay with album title and artist on hover

2. **Top Artists Showcase** (Large)
   - 2x2 grid mixing square artist photos and album covers
   - Artist names with collection count
   - Links to artist detail pages

3. **Genre Distribution** (Large)
   - Visual chart showing genre breakdown
   - Interactive pie chart or bar visualization
   - Top 5 genres with percentages

4. **Statistics Cards** (Mixed Sizes)
   - **Total Count** (Medium): Total releases with animated counter
   - **Peak Month** (Medium): Most active collecting month with featured releases
   - **Average per Month** (Small): Simple metric with trend indicator
   - **Format Types** (Small): Special editions, colored vinyl, reissues
   - **Unique Artists** (Small): Artist diversity metric
   - **First Addition** (Small): Year's first purchase with date
   - **Last Addition** (Small): Year's final purchase with date

5. **Featured Album Covers** (Small)
   - Individual square album covers scattered throughout
   - Showcase standout releases from the year
   - Click-through to album pages

6. **Monthly Timeline** (Medium)
   - Bar chart showing acquisition patterns
   - Hover to see specific months' details

### Image Specifications

#### Album Covers
- **Format**: Square aspect ratio (1:1)
- **Size**: Consistent dimensions across all displays
- **Quality**: High-resolution for crisp display
- **Fallback**: Default placeholder for missing covers

#### Artist Images
- **Format**: Square cropped from original artist photos
- **Integration**: Mixed with album covers in artist grids
- **Consistency**: Uniform sizing with album covers

### Interactive Features

#### Navigation
- **Year Selector**: Dropdown at top of page with all available years + YTD option
- **Pagination Controls**: Previous/Next year buttons at bottom of page
- **Breadcrumbs**: Clear path back to main collection
- **Default Behavior**: `/wrapped` redirects to previous year (2024 in 2025)

#### Animations
- **Scroll Animations**: Cards animate in as user scrolls
- **Hover Effects**: Album covers lift and scale on hover
- **Loading States**: Skeleton screens while data loads
- **Transitions**: Smooth page transitions between years

#### Responsive Behavior
- **Desktop**: Full mixed-size bento grid layout
- **Tablet**: 2-column adaptive grid with resized cards
- **Mobile**: Single column stack with optimized card hierarchy

## Technical Implementation

### 1. Data Generation Script
**File**: `/scripts/generate-wrapped-data.ts`
- TypeScript script to process collection data
- Runs as part of build process or manually
- Generates optimized JSON files for each year
- Includes error handling and data validation

### 2. React Components
**Structure**:
```
/src/pages/wrapped/
├── WrappedYear.tsx          # Annual retrospective
├── WrappedYTD.tsx           # Year to date view
└── components/
    ├── BentoGrid.tsx        # Main mixed-size grid layout
    ├── AlbumGrid.tsx        # Top albums display (square)
    ├── ArtistGrid.tsx       # Top artists showcase (square)
    ├── StatsCard.tsx        # Individual stat cards (various sizes)
    ├── GenreChart.tsx       # Genre distribution visualization
    ├── FeaturedCover.tsx    # Individual album covers
    ├── YearSelector.tsx     # Dropdown year selector
    └── YearPagination.tsx   # Previous/Next navigation
```

### 3. Routing Integration
- Add routes to existing React Router setup
- Root `/wrapped` redirects to previous year (e.g., 2024 in 2025)
- Dynamic routing for `/wrapped/:year`
- Special route for `/wrapped/ytd` (year to date)
- 404 handling for invalid years
- SEO optimization with proper meta tags

### 4. Data Fetching
- Utilize existing data fetching patterns
- Lazy loading for large datasets
- Caching strategy for performance
- Error boundaries for graceful failures

## Content Strategy

### Visual Storytelling
- **Opening Flow**: Scattered statistics tell the year's story
- **Key Insights**: Highlight interesting patterns and discoveries
- **Visual Hierarchy**: Mixed card sizes guide attention naturally
- **Call-to-Actions**: Links to explore specific albums/artists

### Accessibility
- **Alt Text**: Comprehensive descriptions for all images
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Readers**: Proper ARIA labels and structure
- **Color Contrast**: Meeting WCAG guidelines

## Performance Considerations

### Optimization
- **Image Loading**: Lazy loading with proper square sizing
- **Data Chunking**: Load year data on demand
- **Caching**: Browser and CDN caching strategies
- **Bundle Splitting**: Separate chunks for wrapped feature

### Progressive Enhancement
- **Core Content**: Works without JavaScript
- **Enhanced Experience**: Rich interactions with JS enabled
- **Offline Support**: Basic caching for viewed years

## Development Timeline

### Phase 1: Data Foundation (Week 1)
- [x] Create data generation script
- [x] Generate sample wrapped data for testing
- [x] Define TypeScript interfaces

### Phase 2: Core Components (Week 2)
- [x] Build basic page structure and routing
- [x] Implement mixed-size bento grid layout system
- [x] Create reusable card components with various sizes

### Phase 3: Visual Polish (Week 3)
- [ ] Add animations and transitions
- [ ] Implement responsive design with proper card scaling
- [ ] Integrate with existing design system
- [ ] Ensure all album covers are properly square

### Phase 4: Testing & Optimization (Week 4)
- [ ] Performance optimization
- [ ] Accessibility testing
- [ ] Cross-browser compatibility
- [ ] User testing and refinements

## Success Metrics

### User Engagement
- Time spent on wrapped pages
- Click-through rates to album/artist pages
- Return visits to different years
- Social sharing (if implemented)

### Technical Performance
- Page load times under 2 seconds
- Lighthouse scores above 90
- Zero accessibility violations
- Mobile performance optimization

## Future Enhancements

### Advanced Features
- **Comparison Mode**: Compare different years side-by-side
- **Export Options**: Share wrapped summaries as images
- **Playlist Generation**: Create Spotify playlists from year data
- **Collection Insights**: Deeper analytics and trends

### Social Features
- **Sharing**: Generate shareable wrapped summaries
- **Community**: Compare with other collectors (privacy-conscious)
- **Achievements**: Collecting milestones and badges

## Conclusion

This Vinyl Wrapped feature will transform your rich collection data into engaging, visually stunning annual retrospectives. By leveraging the existing data architecture and modern design principles, we can create a compelling experience that celebrates your vinyl collecting journey while maintaining the sophisticated aesthetic of RussFM.

The mixed-size bento grid approach allows for flexible, visually interesting layouts that can showcase both statistics and beautiful square album artwork, creating an immersive experience that encourages exploration of the collection without overwhelming the user with a traditional hero section.

Ready to proceed with implementation?
