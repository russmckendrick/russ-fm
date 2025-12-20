# Utilities Reference

This document covers all utility functions in the russ.fm frontend.

## Image Utilities (`src/lib/image-utils.ts`)

**CRITICAL**: Always use these functions for images. Never hardcode paths.

### getImageUrl

Environment-aware image URL generation.

```typescript
import { getImageUrl } from '@/lib/image-utils';

const url = getImageUrl('/album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg');
// Development: /album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg
// Production: https://assets.russ.fm/album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg
```

---

### getAlbumImageUrl

Generate album image URL with proper sizing.

```typescript
import { getAlbumImageUrl } from '@/lib/image-utils';

const url = getAlbumImageUrl('radiohead-ok-computer', 'medium');
// /album/radiohead-ok-computer/radiohead-ok-computer-medium.jpg

const hiRes = getAlbumImageUrl('radiohead-ok-computer', 'hi-res');
// /album/radiohead-ok-computer/radiohead-ok-computer-hi-res.jpg
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| albumSlug | `string` | Yes | Album folder slug |
| size | `'hi-res' \| 'medium'` | No | Image size (default: 'medium') |

**Important**: Only `'hi-res'` and `'medium'` sizes exist. Never use `'small'`.

---

### getArtistImageUrl

Generate artist image URL.

```typescript
import { getArtistImageUrl } from '@/lib/image-utils';

const url = getArtistImageUrl('radiohead', 'medium');
// /artist/radiohead/radiohead-medium.jpg
```

---

### getArtistAvatarUrl

Get artist avatar (small square format).

```typescript
import { getArtistAvatarUrl } from '@/lib/image-utils';

const url = getArtistAvatarUrl('radiohead');
// /artist/radiohead/radiohead-avatar.jpg
```

---

### getAlbumOGImageUrl

Get Open Graph image URL (always absolute).

```typescript
import { getAlbumOGImageUrl } from '@/lib/image-utils';

const url = getAlbumOGImageUrl('radiohead-ok-computer');
// https://russ.fm/og-images/radiohead-ok-computer.png
```

---

### getAlbumImageFromData

Extract slug from album data and get image.

```typescript
import { getAlbumImageFromData } from '@/lib/image-utils';

// album.uri_release = "/album/radiohead-ok-computer"
const url = getAlbumImageFromData(album.uri_release, 'medium');
```

This is the **recommended way** to get album images from album objects.

---

### getArtistImageFromData

Extract slug from artist data and get image.

```typescript
import { getArtistImageFromData } from '@/lib/image-utils';

const url = getArtistImageFromData(artist.uri_artist, 'medium');
```

---

### handleImageError

Fallback handler for broken images.

```typescript
import { handleImageError } from '@/lib/image-utils';

<img
  src={imageUrl}
  onError={handleImageError}
  alt={title}
/>
```

Attempts to load an "unknown" placeholder image.

---

### getAlbumSlug / getArtistSlug

Extract slug from URI path.

```typescript
import { getAlbumSlug, getArtistSlug } from '@/lib/image-utils';

getAlbumSlug('/album/radiohead-ok-computer'); // 'radiohead-ok-computer'
getArtistSlug('/artist/radiohead'); // 'radiohead'
```

---

### sanitizeJsonPath

Normalize JSON file paths.

```typescript
import { sanitizeJsonPath } from '@/lib/image-utils';

sanitizeJsonPath('/album/some-album'); // '/album/some-album/index.json'
```

---

## Genre Utilities (`src/lib/genreUtils.ts`)

### getCleanGenres

Get cleaned genre list from album with fallback chain.

```typescript
import { getCleanGenres } from '@/lib/genreUtils';

const genres = getCleanGenres(album);
// Priority: Apple Music > Spotify > Discogs genres
// Filters out low-quality/invalid genres
```

---

### filterLowQualityGenres

Filter out invalid genre strings.

```typescript
import { filterLowQualityGenres } from '@/lib/genreUtils';

const genres = ['Electronic', 'rock', '12345', '', 'Ambient'];
const clean = filterLowQualityGenres(genres);
// ['Electronic', 'Ambient']
```

**Filtered out:**
- All lowercase genres
- Numeric genres
- Empty strings
- Genres matching artist name

---

### getCleanGenresFromArray

Simple array-based genre filtering.

```typescript
import { getCleanGenresFromArray } from '@/lib/genreUtils';

const genres = getCleanGenresFromArray(album.genre_names, album.release_artist);
```

This is the **recommended function** for genre filtering.

---

## Color Utilities (`src/lib/color-utils.ts`)

### Color Conversion

```typescript
import { hexToRgb, rgbToHex } from '@/lib/color-utils';

hexToRgb('#ff6600'); // { r: 255, g: 102, b: 0 }
rgbToHex(255, 102, 0); // '#ff6600'
```

---

### Contrast & Accessibility

```typescript
import {
  getLuminance,
  getContrastRatio,
  hasGoodContrast,
  getBestTextColor,
  getReadableTextColor,
  getEnhancedTextColor
} from '@/lib/color-utils';

getLuminance('#ff6600'); // 0.32
getContrastRatio('#ffffff', '#000000'); // 21

hasGoodContrast('#ffffff', '#000000'); // true (>= 4.5:1)
hasGoodContrast('#ffffff', '#000000', 'AAA'); // true (>= 7:1)

getBestTextColor('#1a1a2e'); // '#ffffff' or '#000000'

getReadableTextColor('#1a1a2e', { preferLight: true });
// Returns best readable color with fallbacks

getEnhancedTextColor('#1a1a2e', isDarkMode);
// Returns { color, textShadow } for maximum readability
```

---

### Color Manipulation

```typescript
import { lightenColor, darkenColor, addAlpha } from '@/lib/color-utils';

lightenColor('#1a1a2e', 20); // 20% lighter
darkenColor('#ff6600', 10); // 10% darker
addAlpha('#ff6600', 0.5); // '#ff660080'
```

---

### Gradient Generation

```typescript
import {
  createAlbumGradient,
  createGlowGradient,
  createAlbumShadow,
  createColorBleeding,
  createHeroBackground
} from '@/lib/color-utils';

// Context-aware gradient
createAlbumGradient(colors, 'hero');
// Returns CSS gradient string for hero sections

createAlbumGradient(colors, 'card');
// Returns CSS gradient for card backgrounds

createGlowGradient(colors, 'medium');
// Returns glow effect gradient

createAlbumShadow(colors);
// Returns CSS box-shadow using album colors

createColorBleeding(colors);
// Returns vibrant overlay effect

createHeroBackground(colors);
// Returns bold hero section background
```

---

### CSS Custom Properties

```typescript
import { generateColorProperties, getComplementaryColors } from '@/lib/color-utils';

generateColorProperties(colors);
// Returns object for style prop:
// {
//   '--album-bg': '#1a1a2e',
//   '--album-fg': '#ffffff',
//   '--album-accent': '#ff6600',
//   '--album-muted': '#666666'
// }

getComplementaryColors(colors);
// Returns extended palette with lighter/darker variants
```

---

## Genre Color Generator (`src/lib/genreColors.ts`)

### getGenreColor

Consistent color hash from genre name.

```typescript
import { getGenreColor } from '@/lib/genreColors';

getGenreColor('Electronic'); // '#3b82f6' (consistent for same input)
getGenreColor('Rock'); // '#ef4444'
```

Uses HSL color space with 0-360° hue range.

---

### getGenreTextColor

Text color for genre tags.

```typescript
import { getGenreTextColor } from '@/lib/genreColors';

getGenreTextColor('Electronic'); // '#ffffff' (always white)
```

---

## Music Service Utilities (`src/lib/musicServiceUtils.ts`)

### URL Validation

```typescript
import { isValidSpotifyUrl, isValidAppleMusicUrl } from '@/lib/musicServiceUtils';

isValidSpotifyUrl('https://open.spotify.com/album/123'); // true
isValidAppleMusicUrl('https://music.apple.com/us/album/123'); // true
```

---

### URL Parsing

```typescript
import { parseSpotifyUrl, parseAppleMusicUrl } from '@/lib/musicServiceUtils';

parseSpotifyUrl('https://open.spotify.com/album/123?si=abc');
// { type: 'album', id: '123', market: null }

parseAppleMusicUrl('https://music.apple.com/us/album/title/123');
// { type: 'album', id: '123', storefront: 'us' }
```

---

### ID Extraction

```typescript
import { extractSpotifyAlbumId, extractAppleMusicAlbumId } from '@/lib/musicServiceUtils';

extractSpotifyAlbumId('https://open.spotify.com/album/123'); // '123'
extractAppleMusicAlbumId('https://music.apple.com/us/album/title/123'); // '123'
```

---

### Embed URL Generation

```typescript
import { buildSpotifyEmbedUrl, buildAppleMusicEmbedUrl } from '@/lib/musicServiceUtils';

buildSpotifyEmbedUrl('123');
// 'https://open.spotify.com/embed/album/123?utm_source=generator'

buildAppleMusicEmbedUrl('123');
// 'https://embed.music.apple.com/us/album/123'
```

---

### URL Normalization

```typescript
import { validateAndNormalizeUrl } from '@/lib/musicServiceUtils';

validateAndNormalizeUrl('open.spotify.com/album/123');
// 'https://open.spotify.com/album/123'
```

---

### Error Handling

```typescript
import { MusicServiceError } from '@/lib/musicServiceUtils';

try {
  parseSpotifyUrl(invalidUrl);
} catch (e) {
  if (e instanceof MusicServiceError) {
    console.log(e.service); // 'spotify'
    console.log(e.message); // Error details
  }
}
```

---

## Path Sanitization (`src/lib/sigurRosNormalizer.ts`)

### sanitizeFolderName

Convert text to URL-safe folder names.

```typescript
import { sanitizeFolderName } from '@/lib/sigurRosNormalizer';

sanitizeFolderName('Sigur Rós'); // 'sigur-ros'
sanitizeFolderName('Björk - Homogenic'); // 'bjork-homogenic'
sanitizeFolderName('( )'); // 'unknown'
```

**Handles:**
- Unicode spaces (various types)
- Accented characters (ü→u, é→e)
- Greek letters
- Japanese characters
- Special symbols (½→half, &→and)
- Multiple/leading/trailing dashes

---

### Sigur Rós-Specific Functions

```typescript
import {
  isSigurRos,
  normalizeSigurRosTitle,
  normalizeSigurRosForPath,
  normalizeSigurRosArtistName
} from '@/lib/sigurRosNormalizer';

isSigurRos('Sigur Rós'); // true
isSigurRos('sigur ros'); // true

normalizeSigurRosTitle('( )'); // 'Untitled'
normalizeSigurRosForPath('( )'); // 'untitled'
normalizeSigurRosArtistName('sigur rós'); // 'Sigur Rós'
```

---

## Generic Utilities (`src/lib/utils.ts`)

### cn (Class Name Merger)

Merge Tailwind CSS classes with conflict resolution.

```typescript
import { cn } from '@/lib/utils';

cn('px-4 py-2', 'px-6'); // 'py-2 px-6' (px-6 wins)
cn('text-red-500', condition && 'text-blue-500');
cn(['flex', 'items-center'], 'gap-4');
```

Uses `clsx` for conditional classes and `tailwind-merge` for conflict resolution.

**Common Patterns:**
```typescript
// Conditional classes
<div className={cn('base-class', isActive && 'active-class')} />

// Variant handling
<Button className={cn(
  'px-4 py-2 rounded',
  variant === 'primary' && 'bg-blue-500 text-white',
  variant === 'secondary' && 'bg-gray-100 text-gray-800',
  className // Allow override
)} />

// Array of classes
<div className={cn([
  'flex',
  'items-center',
  'justify-between'
])} />
```

---

## Usage Examples

### Complete Album Card

```typescript
import { getAlbumImageFromData } from '@/lib/image-utils';
import { getCleanGenresFromArray } from '@/lib/genreUtils';
import { getGenreColor } from '@/lib/genreColors';
import { cn } from '@/lib/utils';

function AlbumCard({ album }) {
  const genres = getCleanGenresFromArray(album.genre_names, album.release_artist);

  return (
    <div className={cn('rounded-lg overflow-hidden shadow-md')}>
      <img
        src={getAlbumImageFromData(album.uri_release, 'medium')}
        alt={album.release_name}
        className="w-full aspect-square object-cover"
      />
      <div className="p-4">
        <h3>{album.release_name}</h3>
        <div className="flex gap-1 mt-2">
          {genres.slice(0, 3).map(genre => (
            <span
              key={genre}
              style={{ backgroundColor: getGenreColor(genre) }}
              className="px-2 py-1 text-xs rounded text-white"
            >
              {genre}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Dynamic Album Theming

```typescript
import { useAlbumColors } from '@/hooks/useAlbumColors';
import { createAlbumGradient, generateColorProperties } from '@/lib/color-utils';

function AlbumHero({ slug }) {
  const { colors } = useAlbumColors(slug);

  if (!colors) return <Skeleton />;

  return (
    <div
      style={{
        ...generateColorProperties(colors),
        background: createAlbumGradient(colors, 'hero')
      }}
    >
      <h1 style={{ color: 'var(--album-fg)' }}>
        Album Title
      </h1>
    </div>
  );
}
```

### Service Link Handling

```typescript
import {
  isValidSpotifyUrl,
  extractSpotifyAlbumId,
  buildSpotifyEmbedUrl
} from '@/lib/musicServiceUtils';

function SpotifyPlayer({ url }) {
  if (!isValidSpotifyUrl(url)) {
    return null;
  }

  const albumId = extractSpotifyAlbumId(url);
  const embedUrl = buildSpotifyEmbedUrl(albumId);

  return (
    <iframe
      src={embedUrl}
      width="100%"
      height="352"
      allow="encrypted-media"
    />
  );
}
```

---

## Best Practices

### Always Use Image Utilities

```typescript
// Correct
import { getAlbumImageFromData } from '@/lib/image-utils';
<img src={getAlbumImageFromData(album.uri_release, 'medium')} />

// Incorrect - breaks in production
<img src={album.images_uri_release['medium']} />
<img src={`/album/${slug}/${slug}-medium.jpg`} />
```

### Handle Missing Data

```typescript
import { getAlbumImageFromData, handleImageError } from '@/lib/image-utils';

<img
  src={getAlbumImageFromData(album.uri_release, 'medium')}
  onError={handleImageError}
  alt={album.release_name || 'Album'}
/>
```

### Use cn for Class Merging

```typescript
// Correct
import { cn } from '@/lib/utils';
<div className={cn('base', props.className)} />

// Incorrect - classes may conflict
<div className={`base ${props.className}`} />
```
