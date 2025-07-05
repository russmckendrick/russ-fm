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
  
  // API endpoints or external URLs
  external: {
    discogs: 'https://www.discogs.com',
    spotify: 'https://open.spotify.com',
    appleMusic: 'https://music.apple.com',
    lastfm: 'https://www.last.fm',
  },
};

// Type-safe config getter
export function getConfig<T extends keyof typeof appConfig>(key: T): typeof appConfig[T] {
  return appConfig[key];
}