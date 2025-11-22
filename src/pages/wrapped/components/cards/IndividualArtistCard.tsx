import { ExternalLink } from 'lucide-react';
import { ImageSize } from '@/types/wrapped';
import { getAlbumImageUrl, getArtistImageUrl, getArtistAvatarUrl } from '@/lib/image-utils';

interface Artist {
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

interface IndividualArtistCardProps {
  artist: Artist;
  size: 'small' | 'medium' | 'large' | 'wide' | 'extra-wide';
  imageSize?: ImageSize;
}

export function IndividualArtistCard({ artist, size, imageSize = 'hi-res' }: IndividualArtistCardProps) {
  // Select appropriate image size based on card size
  const getArtistImage = () => {
    const artistSlug = artist.slug;
    const albumSlug = artist.topAlbum?.slug;

    switch (imageSize) {
      case 'avatar':
        // Try artist avatar first, then fall back to artist medium, then album medium
        try {
          return getArtistAvatarUrl(artistSlug);
        } catch {
          if (albumSlug) {
            return getAlbumImageUrl(albumSlug, 'medium');
          }
          return getArtistImageUrl(artistSlug, 'medium');
        }
      case 'medium':
        return getArtistImageUrl(artistSlug, 'medium');
      case 'hi-res':
      default:
        return getArtistImageUrl(artistSlug, 'hi-res');
    }
  };

  const artistImage = getArtistImage();

  return (
    <div className="relative h-full w-full group overflow-hidden rounded-2xl bg-card/50 border border-white/5 transition-all duration-300 hover:shadow-xl hover:border-white/10"
      style={{ transform: 'translateZ(0)' }}
    >
      {/* Full background image */}
      {artistImage ? (
        <img
          src={artistImage}
          alt={artist.name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        /* Fallback gradient background */
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600" />
      )}

      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Content overlay - just text at bottom */}
      <div className="absolute inset-0 p-3 flex flex-col justify-end">
        <div className="text-white">
          <h3 className={`font-bold leading-tight line-clamp-2 drop-shadow-lg ${size === 'extra-wide' ? 'text-2xl' : size === 'large' ? 'text-xl' : size === 'medium' ? 'text-lg' : size === 'wide' ? 'text-base' : 'text-sm'
            }`}>
            {artist.name}
          </h3>
          <p className={`font-medium mt-1 drop-shadow-lg ${size === 'extra-wide' ? 'text-lg' : size === 'large' ? 'text-base' : size === 'medium' ? 'text-sm' : 'text-xs'
            } ${artist.count >= 10 ? 'text-yellow-300' :
              artist.count >= 5 ? 'text-blue-300' :
                artist.count >= 3 ? 'text-green-300' : 'text-white/90'
            }`}>
            {artist.count} release{artist.count !== 1 ? 's' : ''}
            {artist.count >= 10 && size === 'large' && (
              <span className="ml-2 text-yellow-400 font-bold">★</span>
            )}
          </p>
        </div>
      </div>

      {/* Hover overlay with link */}
      <a
        href={`/artist/${artist.slug}`}
        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/40"
        aria-label={`View ${artist.name} artist page`}
      >
        <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 transform scale-75 group-hover:scale-100 transition-transform duration-200">
          <ExternalLink className="w-6 h-6 text-white" />
        </div>
      </a>
    </div>
  );
}