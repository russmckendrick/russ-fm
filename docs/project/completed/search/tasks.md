# Search Implementation Tasks

## Architecture Update: Separating Global Search from Page Filters

### Rationale
- **Current Issue**: Global search has mixed functionality for different contexts
- **Solution**: Split into simplified global search + dedicated page filters
- **Benefits**: Cleaner code, better UX, improved performance

## Phase 0: Add Search Boxes to Existing Pages (COMPLETED ✅)
**Goal**: Add search input boxes to Albums and Artists pages (they already have filtering)
**Timeline**: 1-2 days
**Status**: COMPLETED

### 0.1 Add Search Box to FilterBar Component (Albums Page) ✅
- [x] Updated `FilterBar.tsx` to include optional search input field
- [x] Added search icon (Search from lucide-react) and clear button (X icon)
- [x] Added searchValue, onSearchChange, and searchPlaceholder props
- [x] Updated styling with flex-1 min-w-[200px] max-w-sm for responsive layout
- [x] Clear button appears conditionally when search has value

### 0.2 Add Search Component to Artists Page ✅
- [x] Added search input directly in Artists page filter bar
- [x] Used Input component from shadcn/ui with consistent styling
- [x] Matched height (h-8) with other filter controls
- [x] Included Search icon and clear (X) functionality
- [x] Positioned as first item in filter bar with flex-1 for responsive width

### 0.3 Update Albums Page ✅
- [x] Removed `searchTerm` prop from AlbumsPage component signature
- [x] Added local searchTerm state with URL parameter sync
- [x] Updated FilterBar usage with searchValue and onSearchChange props
- [x] URL parameter 'search' syncs with local state
- [x] Navigation to page 1 when search changes
- [x] Existing filter logic continues to work with local search

### 0.4 Update Artists Page ✅
- [x] Removed `searchTerm` prop from ArtistsPage component signature
- [x] Added local searchTerm state initialized from URL params
- [x] Added search input as first element in filter section
- [x] URL parameter 'search' syncs bidirectionally
- [x] Navigation to page 1 when search changes
- [x] Search integrates seamlessly with letter filter and sort

### 0.5 Simplify Global Search ✅
- [x] SearchOverlay now manages its own search state
- [x] Added search input directly in SearchOverlay component
- [x] Removed dependency on Navigation's searchTerm
- [x] Results show navigation links to albums/artists
- [x] MobileSearchModal updated to be self-contained
- [x] Search clears when overlay/modal closes

### 0.6 Clean Up Navigation ✅
- [x] Removed searchTerm and setSearchTerm state from Navigation
- [x] Removed all prop drilling through App.tsx
- [x] SearchOverlay receives only isVisible and onClose props
- [x] Desktop search changed from input to button that opens overlay
- [x] Global search now focuses purely on discovery/navigation

## Phase 1: Mobile Search Accessibility (Priority: Critical)
**Goal**: Make search easily accessible on mobile devices
**Timeline**: 1-2 days

### 1.1 Add Floating Search Button ✅ COMPLETED
- [x] Create `SearchFAB` component for mobile (`src/components/SearchFAB.tsx`)
- [x] Position button in bottom-right corner with proper z-index
- [x] Add smooth show/hide on scroll (hides when scrolling down)
- [x] Ensure it doesn't overlap content with safe positioning
- [x] Only show on mobile devices (`md:hidden` class)

### 1.2 Implement Full-Screen Search Modal ✅ COMPLETED
- [x] Create `MobileSearchModal` component (`src/components/MobileSearchModal.tsx`)
- [x] Add slide-up animation from bottom with CSS transitions
- [x] Include large, touch-friendly input field (44px height)
- [x] Add prominent close button (44px touch target)
- [x] Handle back button/swipe down to close
- [x] Add swipe indicator for UX clarity
- [x] Implement keyboard focus management

### 1.3 Update Navigation Component ✅ COMPLETED
- [x] Detect mobile viewport with resize listener
- [x] Show FAB instead of search overlay on mobile
- [x] Keep desktop search in navigation unchanged
- [x] Replace hamburger menu search input with search button
- [x] Integrate mobile search modal into navigation flow

### 1.4 Fix Touch Targets ✅ COMPLETED
- [x] Increase close buttons to 44px minimum touch targets
- [x] Add proper padding (16px) around all clickable elements
- [x] Ensure proper spacing between results (16px gaps)
- [x] Add `min-h-[44px]` to search result links
- [x] Update SearchOverlay close button for consistency

## Phase 2: Search Performance with Fuse.js (Priority: High)
**Goal**: Make search feel instant with Fuse.js fuzzy search
**Timeline**: 2-3 days

### 2.1 Implement Fuse.js Search Service ✅ COMPLETED
- [x] Install Fuse.js dependency (`npm install fuse.js`)
- [x] Create `src/services/searchService.ts` with full SearchService class
- [x] Implement Fuse configuration with weighted keys (desktop vs mobile)
- [x] Create separate configs for mobile/desktop optimization
- [x] Add result post-processing (artist grouping, album counting)
- [x] Handle edge cases (empty queries, Various artists, errors)
- [x] Add performance optimizations (requestIdleCallback, chunked loading)

### 2.2 Create Search Hook ✅ COMPLETED
- [x] Create `src/hooks/useSearch.ts` with comprehensive hooks
- [x] Implement useInstantSearch, useManualSearch, useTypeAheadSearch
- [x] Handle initialization states (indexing, ready, error)
- [x] Implement debounced search with use-debounce
- [x] Add loading/error states with proper error handling
- [x] Provide search results with metadata and statistics

### 2.3 Update Search Components ✅ COMPLETED
- [x] Create shared `SearchResults.tsx` component for consistency
- [x] Refactor `SearchOverlay.tsx` to use Fuse.js
  - Removed manual filtering logic completely
  - Uses search service for all results
  - Added proper error and loading states
  - Integrated with useInstantSearch hook
- [x] Refactor `SearchResultsPage.tsx` to use Fuse.js
  - Uses useManualSearch for larger result sets
  - Added comprehensive error handling
  - Supports URL query synchronization
- [x] Update `MobileSearchModal.tsx` to use Fuse.js
  - Integrated with useInstantSearch hook
  - Uses SearchResults component for consistency
  - List layout optimized for mobile

### 2.4 Optimize Fuse.js Performance
- [ ] Implement chunked indexing for large collections
- [ ] Use Web Worker for indexing (desktop only)
  ```typescript
  // search-worker.js
  importScripts('https://cdn.jsdelivr.net/npm/fuse.js/dist/fuse.min.js');
  
  let fuse;
  self.onmessage = (e) => {
    if (e.data.type === 'INDEX') {
      fuse = new Fuse(e.data.collection, e.data.options);
    } else if (e.data.type === 'SEARCH') {
      self.postMessage(fuse.search(e.data.query));
    }
  };
  ```
- [ ] Add requestIdleCallback for background indexing
- [ ] Implement index persistence in IndexedDB
- [ ] Monitor memory usage and optimize

### 2.5 Add Search Analytics
- [ ] Track search queries (privacy-conscious)
- [ ] Monitor search performance metrics
- [ ] Identify popular search terms
- [ ] Track zero-result queries
- [ ] Use data to improve search config

## Phase 3: Enhanced Search UI (Priority: Medium)
**Goal**: Improve search result display and interactions
**Timeline**: 2-3 days

### 3.1 Responsive Result Layouts
- [ ] Create `SearchResultList` component for mobile
- [ ] Create `SearchResultGrid` component for desktop
- [ ] Add layout switcher for user preference
- [ ] Implement smooth transitions between layouts
- [ ] Ensure consistent spacing and alignment

### 3.2 Result Type Filtering
- [ ] Add filter pills (All, Artists, Albums)
- [ ] Update search logic to support filtering
- [ ] Persist filter selection
- [ ] Show count for each filter
- [ ] Add smooth animations for filter changes

### 3.3 Infinite Scroll
- [ ] Implement pagination logic
- [ ] Add scroll position detection
- [ ] Load more results on scroll
- [ ] Show loading indicator at bottom
- [ ] Handle "no more results" state

### 3.4 Search Result Actions
- [ ] Add long-press menu on mobile
- [ ] Include share, copy link options
- [ ] Add to favorites/playlist (future)
- [ ] Quick preview on hover (desktop)
- [ ] Keyboard navigation support

## Phase 4: Advanced Features (Priority: Low)
**Goal**: Add power-user features and polish
**Timeline**: 3-4 days

### 4.1 Search Operators
- [ ] Parse advanced search syntax
- [ ] Support "artist:", "album:", "year:" operators
- [ ] Add "genre:" and "label:" operators
- [ ] Implement AND/OR logic
- [ ] Show operator hints in UI

### 4.2 Search History & Suggestions
- [ ] Store search history locally
- [ ] Show recent searches on focus
- [ ] Implement search suggestions
- [ ] Add trending searches (if applicable)
- [ ] Allow clearing search history

### 4.3 Voice Search
- [ ] Add microphone button on mobile
- [ ] Implement Web Speech API
- [ ] Handle permissions properly
- [ ] Add visual feedback during recording
- [ ] Fallback for unsupported browsers

### 4.4 Gesture Support
- [ ] Add swipe down to dismiss
- [ ] Implement pull-to-refresh
- [ ] Add haptic feedback (vibration API)
- [ ] Support pinch to zoom on images
- [ ] Add gesture hints for first-time users

## Technical Debt & Refactoring

### Code Organization
- [ ] Extract search logic to custom hook (`useSearch`)
- [ ] Create search context provider
- [ ] Separate search API/service layer
- [ ] Add comprehensive TypeScript types
- [ ] Remove code duplication between components

### Testing
- [ ] Add unit tests for search logic
- [ ] Add integration tests for search flow
- [ ] Add E2E tests for critical paths
- [ ] Test on real devices (BrowserStack)
- [ ] Add performance benchmarks

### Documentation
- [ ] Document search architecture
- [ ] Add JSDoc comments
- [ ] Create search API documentation
- [ ] Add inline code comments
- [ ] Update README with search features

## Implementation Order (UPDATED)

1. **✅ COMPLETED**: Phase 0 (Page-Specific Search) - Added search to Albums/Artists pages
2. **✅ COMPLETED**: Phase 1 (Mobile Accessibility) - SearchFAB, MobileSearchModal, Navigation updates, Touch targets
3. **✅ COMPLETED**: Phase 2.1-2.3 (Fuse.js Integration) - Search service, hooks, component updates
4. **🔄 NEXT**: Phase 2.4-2.5 (Performance Optimization) + Phase 3.1-3.2 (Enhanced UI)
5. **Week 2**: Phase 3.3-3.4 (Advanced UI Features) + Testing
6. **Week 3**: Phase 4 (Advanced Features) + Documentation + Polish

## Benefits of New Architecture

### User Experience
- **Clearer Mental Model**: Users understand what they're searching
- **Faster Results**: Page filters work on already-loaded data
- **Better Discovery**: Dedicated filters for deep exploration
- **Consistent Behavior**: Same filter patterns across pages

### Technical Benefits
- **Simplified Codebase**: No mixed search contexts
- **Better Performance**: No need to load all data for filtering
- **Easier Testing**: Isolated components with clear responsibilities
- **Reusable Components**: Filter bar works across different pages

### Migration Path
1. Implement new filter components without removing existing search
2. Add filters to Albums and Artists pages
3. Gradually simplify global search
4. Remove redundant code once filters are stable

## Current Status: Phase 0, 1 & 2 Complete ✅

**Phase 0 Completed Features (NEW):**
- Local search inputs on Albums and Artists pages
- Integration with existing FilterBar component on Albums page
- Dedicated search input on Artists page matching filter styling
- URL parameter synchronization for bookmarkable searches
- Complete removal of global search prop drilling
- Self-contained SearchOverlay and MobileSearchModal components

**Phase 1 Completed Features:**
- Mobile floating search button with scroll behavior
- Full-screen mobile search modal with gestures
- Mobile-responsive navigation detection
- Touch-optimized targets (44px minimum)
- Proper spacing and accessibility improvements

**Phase 2 Completed Features:**
- Fuse.js integration with fuzzy search capabilities
- Platform-optimized search configurations (mobile vs desktop)
- Comprehensive search hooks (useInstantSearch, useManualSearch)
- Shared SearchResults component for consistency
- Proper error handling and loading states
- Performance optimizations with requestIdleCallback

**Architecture Improvements:**
- Eliminated search term prop drilling through App.tsx
- Each page manages its own search state independently
- Global search simplified to navigation discovery only
- Clear separation between global and local search contexts

**Ready for Phase 3:** Enhanced UI features and advanced functionality

## Success Metrics

- **Performance**: Search results appear in <100ms
- **Mobile Usage**: 80%+ mobile users use search
- **Engagement**: 3x increase in search usage
- **Accessibility**: WCAG 2.1 AA compliance
- **User Satisfaction**: 4.5+ star rating

## Dependencies

### NPM Packages
```json
{
  "fuse.js": "^7.0.0",
  "react-intersection-observer": "^9.5.3",
  "react-window": "^1.8.10",
  "use-debounce": "^10.0.0",
  "react-highlight-words": "^0.20.0"
}
```

### Browser APIs
- Intersection Observer (lazy loading)
- Web Workers (background search)
- Service Worker (offline support)
- Web Speech API (voice search)
- Vibration API (haptic feedback)

## Risk Mitigation

- **Performance**: Start with small index, scale gradually
- **Compatibility**: Progressive enhancement approach
- **Complexity**: Ship features incrementally
- **Testing**: Automated tests for each phase
- **Rollback**: Feature flags for new functionality