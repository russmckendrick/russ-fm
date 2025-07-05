"""Data models for the music collection manager."""

from .release import Release, Track, Artist, Image
from .collection import CollectionItem
from .enrichment import (
    DiscogsData,
    AppleMusicData,
    SpotifyData,
    WikipediaData,
    LastFmData,
    ArtistAppleMusicData,
    ArtistSpotifyData,
    ArtistLastFmData,
)

__all__ = [
    "Release",
    "Track",
    "Artist",
    "Image",
    "CollectionItem",
    "DiscogsData",
    "AppleMusicData",
    "SpotifyData",
    "WikipediaData",
    "LastFmData",
    "ArtistAppleMusicData",
    "ArtistSpotifyData",
    "ArtistLastFmData",
]