# Wrapped Presentation Redesign

## Overview

Transformed the Wrapped feature from a static bento grid into an immersive, presentation-style experience with full-bleed album artwork, dynamic color theming, scroll-snap navigation, and auto-advance functionality.

## Features Implemented

### 1. Presentation-Style Navigation
- **Scroll-snap sections**: Each section takes up the full viewport height with `snap-y snap-mandatory`
- **Keyboard navigation**: Arrow Up/Down to navigate between sections
- **Section indicators**: Dots on the left side showing current position
- **Navigation controls**: Up/Down arrows and play/pause button on the right side

### 2. Auto-Advance Functionality
- **6-second timer** per section (configurable via `autoAdvanceDelay`)
- **Visual progress ring** around the play/pause button showing countdown
- **Auto-stops** on the last section
- **Toggle on/off** with play/pause button

### 3. Section Structure (10 base sections + monthly sections)

| # | Section | Component | Description |
|---|---------|-----------|-------------|
| 1 | Intro | `IntroSection` | Year reveal with scale animation |
| 2 | Summary | `YearSummarySection` | Animated stat counters (albums, artists, avg/month) |
| 3 | First Album | `HeroAlbumSection` | "My Year Started With" - full-bleed hero |
| 4 | Top Artists | `TopArtistsSection` | Top 6 artists with staggered animations |
| 5 | Genres | `GenreBreakdownSection` | Animated genre progress bars |
| 6 | Monthly Journey | `MonthlyJourneySection` | Bar chart with album cover stacks |
| 7 | Decades | `DecadesSection` | Music decades breakdown |
| 8 | Last Album | `HeroAlbumSection` | "My Year Ended With" - full-bleed hero |
| 9 | Explore | `ExploreSection` | Expandable full collection grid |
| 10+ | Albums by Month | `TopAlbumsPerMonthSection` | One section per month with releases |
| Last | Year Navigation | `YearNavigationSection` | Links to previous/next years |

### 4. Albums by Month Sections
- **Individual pages** for each month with releases
- **Pagination** within months (12 albums per page)
- **Left/Right keyboard navigation** for album pagination
- **Up/Down keyboard navigation** for section changes

### 5. Visual Design
- **Full-bleed backgrounds** with dynamic album colors
- **Neutral gradient backgrounds** for data sections
- **Glow effects** and accent color overlays
- **Framer Motion animations** for entrance effects
- **Home logo** in top-left corner for navigation back

---

## File Structure

### New Files Created

```
src/pages/wrapped/
├── WrappedPresentation.tsx          # Main presentation orchestrator
├── hooks/
│   └── useWrappedNavigation.ts      # Navigation state, auto-advance, keyboard
├── components/
│   ├── presentation/
│   │   ├── PresentationContainer.tsx # Scroll-snap container + section wrapper
│   │   ├── SectionIndicator.tsx      # Left-side navigation dots
│   │   └── NavigationControls.tsx    # Right-side controls + progress ring
│   ├── sections/
│   │   ├── IntroSection.tsx          # Year intro with animation
│   │   ├── YearSummarySection.tsx    # Stats counters
│   │   ├── HeroAlbumSection.tsx      # Full-bleed album hero (first/last)
│   │   ├── TopArtistsSection.tsx     # Artist grid
│   │   ├── GenreBreakdownSection.tsx # Genre progress bars
│   │   ├── MonthlyJourneySection.tsx # Month bar chart with covers
│   │   ├── DecadesSection.tsx        # Decade breakdown
│   │   ├── ExploreSection.tsx        # Expandable collection grid
│   │   ├── TopAlbumsPerMonthSection.tsx # Per-month album grid
│   │   └── YearNavigationSection.tsx # Year navigation links
│   └── shared/
│       ├── FullBleedBackground.tsx   # Dynamic gradient backgrounds
│       ├── AlbumHero.tsx             # Large album with glow effects
│       ├── AnimatedCounter.tsx       # Number reveal animation
│       └── RevealText.tsx            # Text reveal animations
```

### Modified Files

- `src/pages/wrapped/WrappedYear.tsx` - Renders `WrappedPresentation`
- `src/pages/wrapped/components/DynamicBentoGrid.tsx` - Fixed React keys

---

## Key Technical Implementation

### useWrappedNavigation Hook

```typescript
export function useWrappedNavigation({
  totalSections,
  autoAdvanceDelay = 6000,
  initialSection = 0,
  onSectionChange,
}: UseWrappedNavigationOptions) {
  // State
  const [currentSection, setCurrentSection] = useState(initialSection);
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1 for progress ring

  // Refs to avoid stale closures and infinite loops
  const currentSectionRef = useRef(currentSection);
  const totalSectionsRef = useRef(totalSections);
  const onSectionChangeRef = useRef(onSectionChange);

  // ... navigation functions and auto-advance effect
}
```

**Key Pattern**: Using refs for callbacks passed as props to avoid infinite render loops. The `onSectionChange` callback is stored in a ref and updated via useEffect, preventing the callback from causing dependency changes in memoized functions.

### Progress Ring SVG

```tsx
<svg className="absolute -inset-1 w-12 h-12 -rotate-90">
  {/* Background circle */}
  <circle r="20" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
  {/* Progress circle */}
  <circle
    r="20"
    stroke="white"
    strokeWidth="3"
    strokeDasharray={2 * Math.PI * 20}
    strokeDashoffset={2 * Math.PI * 20 * (1 - progress)}
    style={{ transition: 'stroke-dashoffset 0.1s linear' }}
  />
</svg>
```

The progress ring uses `strokeDasharray` (circumference) and `strokeDashoffset` to create the filling animation.

### Scroll-Snap Container

```tsx
<div className="h-screen overflow-y-auto snap-y snap-mandatory scroll-smooth">
  {sections.map(section => (
    <section className="h-screen snap-start snap-always">
      {section}
    </section>
  ))}
</div>
```

---

## Bug Fixes Applied

### 1. React Key Errors (Empty Keys)
**Problem**: Console showed "Encountered two children with the same key, ''" errors.

**Solution**:
- Removed `AnimatePresence` from `PresentationContainer` and `FullBleedBackground`
- Changed all map keys from data-dependent (slug, name) to index-based (`key={`prefix-${index}`}`)

### 2. Auto-Advance Infinite Loop
**Problem**: Timer kept resetting, never advancing - effect ran hundreds of times per second.

**Cause**: `onSectionChange` was an inline arrow function recreated every render, causing `goToSection` to be recreated, triggering the effect to re-run.

**Solution**: Store `onSectionChange` in a ref and update via useEffect:
```typescript
const onSectionChangeRef = useRef(onSectionChange);
useEffect(() => {
  onSectionChangeRef.current = onSectionChange;
}, [onSectionChange]);

// In callbacks, use ref instead of prop:
onSectionChangeRef.current?.(index);
```

### 3. Progress Ring Not Visible
**Problem**: The SVG progress ring wasn't showing the countdown.

**Solution**: Changed from Framer Motion `pathLength` animation to standard SVG technique using `strokeDasharray` and `strokeDashoffset`.

### 4. "Your" to "My" Text
**Problem**: All text said "Your year" instead of "My year".

**Solution**: Updated all section text from second person to first person.

### 5. Invalid Date Errors
**Problem**: Some dates showed "Invalid Date".

**Solution**: Ensured proper date parsing with fallbacks.

---

## Usage

Navigate to `/wrapped/2024` (or any year with data) to see the presentation:

1. **Manual navigation**: Scroll, use arrow keys, or click navigation controls
2. **Auto-advance**: Click play button to start 6-second auto-advance
3. **Albums by month**: Use left/right arrows to paginate within months
4. **Explore section**: Click "Explore All Albums" to expand the full collection grid

---

## Configuration

In `WrappedPresentation.tsx`:
```typescript
const navigation = useWrappedNavigation({
  totalSections: SECTION_COUNT,
  autoAdvanceDelay: 6000, // 6 seconds per section
  onSectionChange: (section) => {
    console.log(`Viewing section ${section}`);
  },
});
```

---

## Dependencies

- **framer-motion**: Animations and transitions
- **lucide-react**: Icons (ChevronUp, ChevronDown, Play, Pause, etc.)
- **react-router-dom**: Navigation links
- **@/hooks/useAlbumColors**: Dynamic color theming from album artwork
