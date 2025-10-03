export const appConfig = {
  pagination: {
    itemsPerPage: {
      albums: 20,
      artists: 24,
    },
    showPageNumbers: 5, // Number of page numbers to show before ellipsis
  },
  
  // Other app-wide configurations can be added here
  features: {
    enableSearch: true,
    enableFilters: true,
    enableSorting: true,
  },

  // Home page configuration
  homepage: {
    hero: {
      numberOfFeaturedAlbums: 6, // Number of albums in the hero rotation
      autoRotateInterval: 12000, // Auto-rotation interval in milliseconds
      exploreButtonText: 'Vew album', // Text for the main CTA button
    },
    recentlyAdded: {
      displayCount: 12, // Number of recently added albums to show
    },
    eras: {
      excludedDecades: [1930], // Array of decades to exclude (e.g., [1960, 1970])
    },
    randomCollection: {
      displayCount: 12, // Number of random albums to show
    },
    randomArtists: {
      displayCount: 12, // Number of random artists to show
    },
    // Define the order and visibility of homepage sections
    // Comment out sections to hide them, reorder array to change sequence
    sectionOrder: [
      'hero',           // Hero section with featured albums
      'recentAlbums',   // Recently added albums carousel
      'recentArtists',  // Recently added artists carousel
      'genres',         // Popular genres grid (polaroid style)
      'randomCollection', // Random collection grid
      'randomArtists',  // Random artists with polaroid style
    ],
  },
  
  // Site URL
  siteUrl: 'https://russ.fm',

  // Asset configuration for images
  assets: {
    baseUrl: import.meta.env.PROD ? 'https://assets.russ.fm' : '',
    useR2: import.meta.env.PROD, // Only production uses R2
    fallbackUrl: '/fallback-image.jpg'
  },

  // API endpoints or external URLs
  external: {
    discogs: 'https://www.discogs.com',
    spotify: 'https://open.spotify.com',
    appleMusic: 'https://music.apple.com',
    lastfm: 'https://www.last.fm',
  },
  
  // Footer configuration
  footer: {
    links: {
      about: {
        title: 'About',
        items: [
          { label: 'Collection Stats', href: '/stats' },
          { label: 'Random Discovery', href: '/random' },
        ],
      },
      explore: {
        title: 'Explore',
        items: [
          { label: 'Albums', href: '/albums/1' },
          { label: 'Artists', href: '/artists/1' },
          { label: 'Genres', href: '/genres' },
        ],
      },
      external: {
        title: 'Connect',
        items: [
          { label: 'Discogs', href: 'https://www.discogs.com/user/russmck/collection', external: true },
          { label: 'Last.fm', href: 'http://last.fm/user/RussMckendrick', external: true },
          { label: 'GitHub', href: 'https://github.com/russmckendrick/', external: true },
        ],
      },
    },
    copyright: {
      year: 2025,
      text: 'Russ.fm. A personal record collection showcase.',
    },
  },
};

// Type-safe config getter
export function getConfig<T extends keyof typeof appConfig>(key: T): typeof appConfig[T] {
  return appConfig[key];
}