import { ExternalLink } from 'lucide-react';
import { ImageSize } from '@/types/wrapped';
import { getAlbumImageUrl } from '@/lib/image-utils';

interface Release {
  slug: string;
  title: string;
  artist_name: string;
  images: { 'hi-res': string; medium: string; small?: string };
  date_added: string;
}

interface IndividualReleaseCardProps {
  release: Release;
  size: 'small' | 'medium' | 'large' | 'wide';
  imageSize?: ImageSize;
}

export function IndividualReleaseCard({ release, size, imageSize = 'hi-res' }: IndividualReleaseCardProps) {
  // Select appropriate image size based on card size
  const getImageUrlForRelease = () => {
    const albumSlug = release.slug;

    switch (imageSize) {
      case 'avatar':
        return getAlbumImageUrl(albumSlug, 'small');
      case 'medium':
        return getAlbumImageUrl(albumSlug, 'medium');
      case 'hi-res':
      default:
        return getAlbumImageUrl(albumSlug, 'hi-res');
    }
  };

  const imageUrl = getImageUrlForRelease();

  return (
    <div className="relative h-full w-full group overflow-hidden rounded-lg bg-gray-900 transition-all duration-300 hover:shadow-lg"
      style={{ transform: 'translateZ(0)' }} // Force hardware acceleration and prevent overflow
    >
      {/* Full background image */}
      <img
        src={imageUrl}
        alt={`${release.title} by ${release.artist_name}`}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />

      {/* Dark gradient overlay for text readability - only on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Content overlay - only visible on hover */}
      <div className="absolute inset-0 p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="text-white">
          <h3 className={`font-bold leading-tight line-clamp-2 drop-shadow-lg ${size === 'large' ? 'text-lg' : size === 'medium' ? 'text-base' : 'text-sm'
            }`}>
            {release.title}
          </h3>
          <p className={`text-white/90 font-medium line-clamp-1 mt-1 drop-shadow-lg ${size === 'large' ? 'text-base' : 'text-sm'
            }`}>
            {release.artist_name}
          </p>
        </div>
      </div>

      {/* Hover overlay with link */}
      <a
        href={`/album/${release.slug}`}
        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out bg-black/40"
        aria-label={`View ${release.title} by ${release.artist_name}`}
      >
        <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 transform scale-75 group-hover:scale-110 transition-all duration-300 ease-out hover:bg-white/30">
          <ExternalLink className="w-6 h-6 text-white transition-transform duration-200 group-hover:rotate-12" />
        </div>
      </a>
    </div>
  );
}