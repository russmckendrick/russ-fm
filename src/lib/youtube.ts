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
