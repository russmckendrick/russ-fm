"""Music API services."""

from .discogs import DiscogsService
from .apple_music import AppleMusicService
from .spotify import SpotifyService
from .wikipedia import WikipediaService
from .lastfm import LastFmService
from .theaudiodb import TheAudioDBService
from .perplexity import PerplexityService

__all__ = [
    "DiscogsService",
    "AppleMusicService",
    "SpotifyService",
    "WikipediaService",
    "LastFmService",
    "TheAudioDBService",
    "PerplexityService",
]