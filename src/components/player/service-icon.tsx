import type { IconType } from 'react-icons';
import { SiApplemusic, SiDiscogs, SiGithub, SiLastdotfm, SiMusicbrainz, SiSpotify, SiWikipedia, SiYoutube } from 'react-icons/si';

/** Brand icons for the outside services russ.fm links to, matched by host. */
const SERVICES: Array<{ host: RegExp; icon: IconType }> = [
  { host: /(^|\.)spotify\.com$/, icon: SiSpotify },
  { host: /(^|\.)music\.apple\.com$/, icon: SiApplemusic },
  { host: /(^|\.)(last\.fm|lastfm\.[a-z.]+)$/, icon: SiLastdotfm },
  { host: /(^|\.)discogs\.com$/, icon: SiDiscogs },
  { host: /(^|\.)wikipedia\.org$/, icon: SiWikipedia },
  { host: /(^|\.)(youtube\.com|youtu\.be)$/, icon: SiYoutube },
  { host: /(^|\.)musicbrainz\.org$/, icon: SiMusicbrainz },
  { host: /(^|\.)github\.com$/, icon: SiGithub },
];

/** The brand icon for an external URL, or null when it isn't a known service. */
export function serviceIconFor(url: string): IconType | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return SERVICES.find(s => s.host.test(host))?.icon ?? null;
}
