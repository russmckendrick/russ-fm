/** The 11-character video id from a YouTube watch, embed or youtu.be URL. */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

/** YouTube video URLs (as stored on the release) that resolve to an id. */
export function youTubeVideos(urls?: string[] | null): Array<{ url: string; id: string }> {
  return (urls ?? [])
    .map(url => ({ url, id: extractYouTubeId(url) }))
    .filter((v): v is { url: string; id: string } => v.id !== null);
}

// Titles come from YouTube oEmbed (no key needed). Cached for the tab so
// switching albums and back doesn't refetch.
const titleCache = new Map<string, Promise<string | null>>();

/** A video's title from YouTube oEmbed, or null if YouTube won't say. */
export function fetchYouTubeTitle(url: string): Promise<string | null> {
  let pending = titleCache.get(url);
  if (!pending) {
    pending = fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => (typeof data?.title === 'string' ? data.title : null))
      .catch(() => null);
    titleCache.set(url, pending);
  }
  return pending;
}
