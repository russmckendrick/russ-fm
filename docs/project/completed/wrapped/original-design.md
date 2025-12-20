# Vinyl Unwrapped - Design Documentation

## Overview
Vinyl Unwrapped is a personal vinyl record collection visualization web application that presents an annual retrospective of vinyl records added to a collection. The application transforms raw collection data into an interactive, visually engaging experience that allows users to explore their vinyl collecting journey through time.

## Data Structure

### Collection Data Format
Each year's vinyl collection is stored in individual JSON files named `collection_YYYY.json` (e.g., `collection_2024.json`). These files contain an array of record objects with comprehensive metadata about each vinyl record.

### Record Object Structure
Each vinyl record entry contains the following information:

#### Core Identification
- **ID**: A unique numeric identifier for each record
- **Title**: The album or record title
- **Artist**: An array of artist names (supports multiple artists/collaborations)
- **Date Added**: ISO 8601 timestamp indicating when the record was added to the collection
- **Year**: The release year of the record

#### Visual Assets
- **Cover Image**: URL to the album artwork image
- **Artist Image**: URL to the artist's photograph
- **Album URI**: Direct link to the album's detail page
- **Artist URI**: Direct link to the artist's profile page

#### Physical Format Details
- **Formats**: Detailed information about the vinyl format including:
  - Format name (typically "Vinyl")
  - Quantity (number of discs)
  - Special notes (e.g., "Silver Vinyl, Signed Print")
  - Descriptions array (e.g., ["LP", "Album", "Limited Edition", "Reissue"])

#### Classification
- **Labels**: Array of record label names
- **Genres**: Array of broad musical genres (e.g., "Rock", "Electronic")
- **Styles**: Array of specific musical styles (e.g., "Alternative Rock", "Synth-pop", "Indie Rock")

## Application Structure

### Home Page - Year Selection Timeline

#### Layout
The home page features a minimalist design with a dynamic background and central timeline interface.

#### Visual Elements

**Timeline Interface**
- Vertical timeline with a glowing gradient line as the spine
- Years displayed in reverse chronological order (newest to oldest)
- Timeline spans from 2015 to 2024

**Year Nodes**
Each year is represented by an interactive card containing:

- **Timeline Connection**
  - Small circular node on the timeline spine
  - Horizontal connecting line to the year card
  - Both elements animate on hover

- **Year Card Design**
  - Semi-transparent black background with backdrop blur
  - Large year number on the left
  - Vertical divider line with gradient effect
  - Addition count displayed prominently on the right
  - Date range showing first and last addition dates (DD/MM format)

- **Interactive States**
  - Hover effects include:
    - Card slides right
    - Background opacity increases
    - Border becomes more visible
    - Colors transition to active state
    - Shadow effect appears
    - Scale transformation on elements

### Year View Page - Annual Collection Deep Dive

#### Navigation Header
- Fixed position header with backdrop blur effect
- Three sections:
  - Left: "Vinyl Unwrapped" home link
  - Center: Year selector pills (desktop) showing all available years
  - Right: Mobile menu toggle (mobile only)
- Current year highlighted with Spotify green background
- Mobile menu displays years in a 3-column grid

#### Page Title Section
- Large gradient title showing "Vinyl Unwrapped [YEAR]"
- Subtitle: "Updates to my collection in [YEAR]"
- Centered alignment with generous spacing

#### Statistics Section - Year in Numbers

**Layout**: Three-column grid (2 columns on mobile)

**Metrics Displayed**:
1. **Records Added**: Total count of vinyl records added during the year
2. **Most Common Style**: The musical style that appears most frequently
3. **Average Records/Month**: Calculated average of monthly additions

**Design**:
- Large bold numbers in Spotify green
- Descriptive labels below each metric
- Most Common Style spans full width on mobile for better readability

#### Visualization Components

##### Style Distribution Cloud

**Purpose**: Visual representation of musical style diversity and frequency

**Layout**:
- Full-width container with 600px height
- Dark semi-transparent background
- Rounded corners

**Functionality**:
- Words (musical styles) positioned using D3.js cloud layout
- Size remains constant (32px) for readability
- Each style has a unique color from a predefined palette
- Random rotation angles (-45° to +45°) for visual interest
- Shows occurrence count for each style

**Interactions**:
- Click on any style to activate focus mode
- Active style moves to top center position
- Other styles push away with physics-based animation
- Displays album preview grid showing covers for that style
- Preview includes scroll indicator if more than 3 albums
- Click anywhere else to reset positions

##### Monthly Additions Chart

**Purpose**: Visualize collection growth patterns throughout the year

**Layout**:
- Full-width bar chart with 300px height
- X-axis: All 12 months of the year
- Y-axis: Number of records added

**Design**:
- Each month gets a unique color from the palette
- Rounded corners on bars
- Count labels displayed above each bar
- Month names rotated 45° for readability

**Interactions**:
- Hover effect brightens and lifts bars
- Clicking a bar scrolls to that month's section
- Smooth scroll animation to monthly timeline

##### Top Artists Grid

**Purpose**: Highlight the most collected artists of the year

**Layout**:
- Responsive grid layout:
  - Mobile: 2 columns
  - Tablet: 3 columns  
  - Desktop: 4 columns
- Shows top 16 artists (excluding "Various Artists")

**Card Design**:
- Artist image or initial in circular frame
- Ranking badge (#1, #2, etc.) in top-left corner
- Artist name (truncated if too long)
- Record count below name
- Semi-transparent background
- Hover effect lightens background

**Data Processing**:
- Aggregates all artist appearances
- Removes duplicate numbering (e.g., "Artist (2)")
- Combines collaborative artists with " & "

##### Monthly Timeline

**Purpose**: Chronological display of all additions with visual browsing

**Layout**:
- Vertical timeline with central spine line
- Monthly sections in chronological order
- Each section has a timeline node marker

**Month Sections**:
- Month name and year as header
- Addition count indicator
- Horizontal scrolling album gallery

**Album Gallery**:
- Displays album covers in a horizontal row
- Each album is 192px wide (w-48)
- 16px gap between albums
- Maintains aspect ratio (square covers)

**Album Cards**:
- Album cover image
- Hover overlay with gradient fade
- Title and artist information on hover
- Links to external album page
- Smooth scale transformation on hover

**Scrolling Features**:
- Hidden scrollbar for cleaner appearance
- Gradient fade indicators on left/right edges
- Navigation arrows appear on hover
- Smooth horizontal scrolling

#### Footer Navigation
- Previous/Next year navigation links
- Only shows available years
- Attribution text

## Color Palette

### Primary Colors
- **Spotify Green**: #1DB954 (primary accent)
- **Blue**: #60A5FA (secondary accent)
- **Purple**: #A78BFA (tertiary accent)

### Background Colors
- **Vinyl Black**: #0A0A0A (darkest)
- **Vinyl Dark**: #1A1A1A (dark)
- **Vinyl Light**: #E5E5E5 (light text)

### Visualization Colors
Extended palette for data visualization:
- Hot Pink: #FF0080
- Cyan: #00BCD4
- Orange: #FF9800
- Pink: #E91E63
- Purple: #9C27B0
- Green: #4CAF50
- Blue: #2196F3

## Responsive Design

### Breakpoints
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

### Mobile Adaptations
- Collapsible year navigation menu
- Adjusted grid layouts
- Touch-friendly interactions
- Optimized spacing and sizing
- Horizontal scrolling for galleries

### Desktop Enhancements
- Hover effects and animations
- Multi-column layouts
- Expanded navigation options
- Larger visualization areas

## User Experience Flow

1. **Landing**: User sees animated timeline of available years
2. **Year Selection**: Hovering highlights years, clicking navigates
3. **Year Overview**: Statistics provide quick insights
4. **Exploration**: Interactive visualizations encourage discovery
5. **Deep Dive**: Monthly timeline allows chronological browsing
6. **Navigation**: Easy movement between years and return home

## Visual Design Principles

1. **Dark Theme**: Reduces eye strain and creates focus on content
2. **Gradient Accents**: Adds visual interest without overwhelming
3. **Transparency**: Creates depth and layering effects
4. **Smooth Animations**: Provides feedback and enhances interactivity
5. **Information Hierarchy**: Clear structure guides user attention
6. **Consistent Spacing**: Creates rhythm and improves readability
7. **Progressive Disclosure**: Details revealed through interaction