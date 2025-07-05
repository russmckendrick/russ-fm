"""Music API services."""

from .discogs import DiscogsService
from .apple_music import AppleMusicService
from .spotify import SpotifyService
from .wikipedia import WikipediaService
from .lastfm import LastFmService

__all__ = [
    "DiscogsService",
    "AppleMusicService", 
    "SpotifyService",
    "WikipediaService",
    "LastFmService",
]