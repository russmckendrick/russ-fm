"""Core release data models."""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path


@dataclass
class Image:
    """Represents an image (artwork, artist photo, etc.)."""
    url: str
    type: str  # 'primary', 'secondary', 'artist', etc.
    width: Optional[int] = None
    height: Optional[int] = None
    resource_url: Optional[str] = None


@dataclass
class Artist:
    """Represents an artist with comprehensive information."""
    id: Optional[str] = None
    name: str = ""
    role: Optional[str] = None  # 'artist', 'featuring', 'producer', etc.
    biography: Optional[str] = None
    images: List[Image] = field(default_factory=list)
    
    # External IDs
    discogs_id: Optional[str] = None
    apple_music_id: Optional[str] = None
    spotify_id: Optional[str] = None
    lastfm_mbid: Optional[str] = None
    
    # URLs
    discogs_url: Optional[str] = None
    apple_music_url: Optional[str] = None
    spotify_url: Optional[str] = None
    lastfm_url: Optional[str] = None
    wikipedia_url: Optional[str] = None
    
    # Artist details
    genres: List[str] = field(default_factory=list)
    popularity: Optional[int] = None
    followers: Optional[int] = None
    country: Optional[str] = None
    formed_date: Optional[str] = None
    
    # Local images
    local_images: Dict[str, Optional[Path]] = field(default_factory=dict)
    
    # Metadata
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Raw data from services
    raw_data: Dict[str, Any] = field(default_factory=dict)
    
    def add_image(self, image: Image) -> None:
        """Add an image to the artist."""
        self.images.append(image)
    
    def get_primary_image(self) -> Optional[Image]:
        """Get the primary image for the artist."""
        for image in self.images:
            if image.type == 'primary':
                return image
        return self.images[0] if self.images else None
    
    def __post_init__(self):
        """Initialize timestamps if not provided."""
        if self.created_at is None:
            self.created_at = datetime.now()
        if self.updated_at is None:
            self.updated_at = datetime.now()


@dataclass
class Track:
    """Represents a track on a release."""
    position: str
    title: str
    duration: Optional[str] = None
    artists: List[Artist] = field(default_factory=list)
    
    # External IDs
    spotify_id: Optional[str] = None
    apple_music_id: Optional[str] = None


@dataclass
class Release:
    """Core release data model."""
    # Basic information
    id: str
    title: str
    artists: List[Artist] = field(default_factory=list)
    
    # Service-specific release names (for matching comparison)
    release_name_discogs: Optional[str] = None
    release_name_apple_music: Optional[str] = None
    release_name_spotify: Optional[str] = None
    
    # Release details
    year: Optional[int] = None
    released: Optional[str] = None
    country: Optional[str] = None
    formats: List[str] = field(default_factory=list)
    labels: List[str] = field(default_factory=list)
    genres: List[str] = field(default_factory=list)
    styles: List[str] = field(default_factory=list)
    
    # Media
    images: List[Image] = field(default_factory=list)
    videos: List[str] = field(default_factory=list)
    
    # Track listing
    tracklist: List[Track] = field(default_factory=list)
    
    # External IDs and URLs
    discogs_id: Optional[str] = None
    apple_music_id: Optional[str] = None
    spotify_id: Optional[str] = None
    lastfm_mbid: Optional[str] = None
    
    # URLs
    discogs_url: Optional[str] = None
    apple_music_url: Optional[str] = None
    spotify_url: Optional[str] = None
    lastfm_url: Optional[str] = None
    
    # Metadata
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    date_added: Optional[datetime] = None  # Date added to collection
    
    # Raw data from services (for debugging/fallback)
    raw_data: Dict[str, Any] = field(default_factory=dict)
    
    # Local image paths (downloaded artwork)
    local_images: Dict[str, Optional[Path]] = field(default_factory=dict)
    
    def add_artist(self, artist: Artist) -> None:
        """Add an artist to the release."""
        if artist not in self.artists:
            self.artists.append(artist)
    
    def add_image(self, image: Image) -> None:
        """Add an image to the release."""
        if image not in self.images:
            self.images.append(image)
    
    def get_primary_image(self) -> Optional[Image]:
        """Get the primary image for this release."""
        for image in self.images:
            if image.type == 'primary':
                return image
        return self.images[0] if self.images else None
    
    def get_artist_names(self) -> List[str]:
        """Get list of artist names."""
        return [artist.name for artist in self.artists]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert release to dictionary for serialization."""
        return {
            'id': self.id,
            'title': self.title,
            'artists': [
                {
                    'id': artist.id,
                    'name': artist.name,
                    'role': artist.role,
                    'biography': artist.biography,
                    'discogs_id': artist.discogs_id,
                    'apple_music_id': artist.apple_music_id,
                    'spotify_id': artist.spotify_id,
                    'lastfm_mbid': artist.lastfm_mbid,
                    'wikipedia_url': artist.wikipedia_url,
                }
                for artist in self.artists
            ],
            'year': self.year,
            'released': self.released,
            'country': self.country,
            'formats': self.formats,
            'labels': self.labels,
            'genres': self.genres,
            'styles': self.styles,
            'images': [
                {
                    'url': img.url,
                    'type': img.type,
                    'width': img.width,
                    'height': img.height,
                    'resource_url': img.resource_url,
                }
                for img in self.images
            ],
            'tracklist': [
                {
                    'position': track.position,
                    'title': track.title,
                    'duration': track.duration,
                    'artists': [
                        {
                            'name': artist.name,
                            'role': artist.role,
                        }
                        for artist in track.artists
                    ],
                }
                for track in self.tracklist
            ],
            'discogs_id': self.discogs_id,
            'apple_music_id': self.apple_music_id,
            'spotify_id': self.spotify_id,
            'lastfm_mbid': self.lastfm_mbid,
            'discogs_url': self.discogs_url,
            'apple_music_url': self.apple_music_url,
            'spotify_url': self.spotify_url,
            'lastfm_url': self.lastfm_url,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'date_added': self.date_added.isoformat() if self.date_added else None,
            'local_images': {
                size: str(path) if path else None
                for size, path in self.local_images.items()
            },
        }