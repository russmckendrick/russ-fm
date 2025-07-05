# Russ.fm - Record Collection Showcase

A modern, responsive React application built with shadcn/ui to showcase a personal record collection.

## Features

### 🎵 Modern UI Components
- Built with **shadcn/ui** and **Tailwind CSS**
- Professional, accessible components
- Responsive design for all devices
- Dark/light mode support (via shadcn/ui theming)

### 🔍 Advanced Filtering & Search
- **Real-time search** across albums, artists, and genres
- **Filter by genre** - dynamically populated from collection
- **Filter by year** - shows all available release years
- **Multiple sort options** - by date added, album name, artist, or release year

### 📊 Collection Analytics
- **Live statistics** showing total albums, artists, and genres
- **Updates dynamically** as filters are applied

### 🎧 Detailed Album Views
- **Modal popups** with high-resolution album artwork
- **Complete tracklist** with track numbers and durations
- **Album metadata** including label, format, and country
- **Genre tags** for easy categorization

### 🎨 Beautiful Design
- **Card-based layout** with hover effects
- **Professional typography** and spacing
- **Gradient headers** and smooth animations
- **Loading states** and error handling

## Technology Stack

- **React 19** with TypeScript
- **shadcn/ui** component library
- **Tailwind CSS** for styling
- **Radix UI** primitives (via shadcn/ui)
- **Lucide React** for icons
- **Vite** for development and building

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd russ-fm-shadcn
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:5174` (or the port shown in terminal)

### Building for Production

```bash
npm run build
npm run preview
```

## Data Structure

The application expects:

- **Collection data:** `/public/collection.json` with album metadata
- **Album images:** `/public/album/[album-id]/` with hi-res, medium, and small images
- **Detailed album data:** `/public/album/[album-id]/[album-id].json` with tracklists and additional metadata

## Components

### Core Components
- **App.tsx** - Main application component with state management
- **AlbumCard.tsx** - Individual album display cards
- **AlbumModal.tsx** - Detailed album view modal
- **FilterBar.tsx** - Search and filter controls
- **CollectionStats.tsx** - Statistics display

### shadcn/ui Components Used
- `Card` - Main content containers
- `Input` - Search functionality
- `Select` - Filter dropdowns
- `Dialog` - Album detail modals
- `Badge` - Genre tags
- `Button` - Interactive elements

## Features in Detail

### Search Functionality
- Searches across album names, artist names, and genres
- Real-time filtering as you type
- Case-insensitive matching

### Filter System
- **Genre Filter:** Dynamically populated from all genres in collection
- **Year Filter:** Shows all available release years
- **Sort Options:** Multiple ways to organize your collection

### Album Details
- High-resolution album artwork
- Complete metadata (label, format, country)
- Full tracklist with durations (when available)
- Spotify integration data display

## Customization

The application uses shadcn/ui's theming system, making it easy to:
- Change colors via CSS variables
- Add dark mode toggle
- Customize component styling
- Add new components from shadcn/ui library

## Performance

- **Lazy loading** for album images
- **Responsive images** (multiple sizes)
- **Optimized React rendering** with proper key props
- **Fast search** with client-side filtering

Built with modern best practices for performance and accessibility.