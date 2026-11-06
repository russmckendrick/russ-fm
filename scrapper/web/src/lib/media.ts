// Artwork URLs, mirroring the site's src/lib/image-utils.ts naming. Served by the scrapper from
// public/ under /media; missing medium/avatar files are derived from hi-res on the fly.

export type AlbumImageSize = 'hi-res' | 'medium'
export type ArtistImageSize = 'hi-res' | 'medium' | 'avatar'

export function albumImageUrl(slug: string, size: AlbumImageSize = 'medium'): string {
  return `/media/album/${slug}/${slug}-${size}.jpg`
}

export function artistImageUrl(slug: string, size: ArtistImageSize = 'medium'): string {
  return `/media/artist/${slug}/${slug}-${size}.jpg`
}

/** The public russ.fm page for a release or artist. */
export function siteUrl(kind: 'album' | 'artist', slug: string): string {
  return `https://www.russ.fm/${kind}/${slug}/`
}
