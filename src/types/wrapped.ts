// Color palette for dynamic theming
export interface ColorPalette {
  background: string;
  foreground: string;
  accent: string;
  muted: string;
}

export interface WrappedRelease {
  release_name: string;
  release_artist: string;
  date_added: string;
  date_release_year: string;
  genre_names: string[];
  slug: string;
  images: {
    'hi-res': string;
    medium: string;
    small?: string;
  };
  artists: Array<{
    name: string;
    slug: string;
    images: {
      'hi-res'?: string;
      medium?: string;
      avatar?: string;
    };
  }>;
  colors?: ColorPalette;
}

export interface WrappedAlbumDetail {
  slug: string;
  styles: string[];
  formats: Array<{ name: string; qty: string; descriptions?: string[] }>;
}

// Dynamic Bento Grid Types
export type GridSize = 'small' | 'medium' | 'large' | 'wide' | 'extra-wide';
export type GridItemType = 'release' | 'artist' | 'stat';
export type ImageSize = 'avatar' | 'medium' | 'hi-res';

export interface GridSpan {
  cols: number;
  rows: number;
}

export interface GridItem {
  id: string;
  type: GridItemType;
  data: WrappedRelease | WrappedArtist | StatCardData;
  size: GridSize;
  gridSpan: GridSpan;
  imageSize: ImageSize;
  animationDelay: number;
}

export interface WrappedArtist {
  name: string;
  slug: string;
  count: number;
  images?: { 'hi-res'?: string; medium?: string; avatar?: string };
  topAlbum?: {
    slug: string;
    title: string;
    images: { 'hi-res': string; medium: string; small?: string };
  };
}

export interface StatCardData {
  type: 'total' | 'peak' | 'average' | 'unique' | 'first' | 'last' | 'decades' | 'timeline' | 'genre';
  title: string;
  value: string | number;
  subtitle?: string;
  data?: WrappedRelease | WrappedRelease[] | { name: string; count: number }[] | { month: string; count: number; releases: WrappedRelease[] }[];
}

// Theme object for page-level color theming
export interface WrappedTheme {
  primary: ColorPalette;           // From first album of the year
  secondary: ColorPalette;         // From last album of the year
  monthlyPalettes: ColorPalette[]; // 12 entries, one per month
}

export interface WrappedData {
  year: number;
  isYearToDate: boolean;
  summary: {
    totalReleases: number;
    uniqueArtists: number;
    topGenre: string;
    topStyle: string;
    avgPerMonth: number;
    peakMonth: string;
    firstAddition: string;
    lastAddition: string;
    projectedTotal?: number;
  };
  releases: Array<{
    release: WrappedRelease;
    albumDetail?: WrappedAlbumDetail;
  }>;
  insights: {
    genres: Array<{ name: string; count: number; percentage: number }>;
    artists: Array<{ name: string; slug: string; count: number; images?: { 'hi-res'?: string; medium?: string; avatar?: string } }>;
    decades: Array<{ name: string; count: number }>;
    timeline: Array<{ month: string; count: number; releases: WrappedRelease[]; dominantColor?: ColorPalette }>;
    topAlbums: Array<{
      slug: string;
      title: string;
      artist_name: string;
      images: { 'hi-res': string; medium: string; small?: string };
      date_added: string;
    }>;
    topArtists: Array<{
      name: string;
      slug: string;
      count: number;
      images?: { 'hi-res'?: string; medium?: string; avatar?: string };
      topAlbum?: {
        slug: string;
        title: string;
        images: { 'hi-res': string; medium: string; small?: string };
      };
    }>;
  };
  theme?: WrappedTheme;
}