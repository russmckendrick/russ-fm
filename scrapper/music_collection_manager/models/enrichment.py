"""Data models for API enrichment data."""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from datetime import datetime


@dataclass
class DiscogsData:
    """Discogs-specific data."""
    id: str
    master_id: Optional[str] = None
    resource_url: Optional[str] = None
    uri: Optional[str] = None
    
    # Discogs-specific fields
    catalog_number: Optional[str] = None
    barcode: Optional[str] = None
    matrix: Optional[str] = None
    
    # Market data
    lowest_price: Optional[float] = None
    num_for_sale: Optional[int] = None
    
    # Community data
    rating: Optional[float] = None
    votes: Optional[int] = None
    want: Optional[int] = None
    have: Optional[int] = None
    
    # Raw data
    raw_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AppleMusicData:
    """Apple Music-specific data."""
    id: Optional[str] = None
    url: Optional[str] = None
    
    # Apple Music specific
    artwork_url: Optional[str] = None  # High-res artwork
    preview_url: Optional[str] = None
    copyright: Optional[str] = None
    editorial_notes: Optional[str] = None
    
    # Metadata
    is_complete: bool = False
    content_rating: Optional[str] = None
    
    # Raw data
    raw_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SpotifyData:
    """Spotify-specific data."""
    id: Optional[str] = None
    url: Optional[str] = None
    
    # Spotify specific
    preview_url: Optional[str] = None
    popularity: Optional[int] = None
    
    # Album data
    album_type: Optional[str] = None
    total_tracks: Optional[int] = None
    release_date: Optional[str] = None
    release_date_precision: Optional[str] = None
    
    # Market data
    available_markets: List[str] = field(default_factory=list)
    
    # External IDs
    external_ids: Dict[str, str] = field(default_factory=dict)
    
    # Images
    images: List[Dict[str, Any]] = field(default_factory=list)
    
    # Label/copyright
    label: Optional[str] = None
    copyrights: List[Dict[str, str]] = field(default_factory=list)
    
    # Tracks (for albums)
    tracks: List[Dict[str, Any]] = field(default_factory=list)
    
    # Additional flags
    explicit: Optional[bool] = None
    
    # Raw data
    raw_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WikipediaData:
    """Wikipedia-specific data."""
    url: Optional[str] = None
    summary: Optional[str] = None
    
    # Wikipedia specific
    page_id: Optional[str] = None
    title: Optional[str] = None
    extract: Optional[str] = None
    
    # Images
    thumbnail: Optional[str] = None
    original_image: Optional[str] = None
    
    # Additional metadata
    categories: List[str] = field(default_factory=list)
    coordinates: Optional[Dict[str, float]] = None
    birth_date: Optional[str] = None
    birth_place: Optional[str] = None
    
    # Raw data
    raw_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LastFmData:
    """Last.fm-specific data."""
    mbid: Optional[str] = None
    url: Optional[str] = None
    
    # Last.fm specific
    playcount: Optional[int] = None
    listeners: Optional[int] = None
    
    # Tags
    tags: List[str] = field(default_factory=list)
    
    # Bio/Wiki
    bio: Optional[str] = None
    wiki_summary: Optional[str] = None
    wiki_content: Optional[str] = None
    
    # Similar artists (for artist data)
    similar_artists: List[str] = field(default_factory=list)
    
    # Top tracks (for artist data)
    top_tracks: List[Dict[str, Any]] = field(default_factory=list)
    
    # Top albums (for artist data)
    top_albums: List[Dict[str, Any]] = field(default_factory=list)
    
    # Images
    images: List[Dict[str, str]] = field(default_factory=list)
    
    # Raw data
    raw_data: Dict[str, Any] = field(default_factory=dict)


# Artist enrichment models

@dataclass
class ArtistAppleMusicData:
    """Apple Music artist-specific data."""
    id: Optional[str] = None
    url: Optional[str] = None
    
    # Artist specific
    name: Optional[str] = None
    artwork_url: Optional[str] = None
    genres: List[str] = field(default_factory=list)
    origin: Optional[str] = None
    
    # Editorial content
    editorial_notes: Optional[str] = None
    
    # Raw data
    raw_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ArtistSpotifyData:
    """Spotify artist-specific data."""
    id: Optional[str] = None
    url: Optional[str] = None
    
    # Artist details
    name: Optional[str] = None
    popularity: Optional[int] = None
    followers: Optional[int] = None
    genres: List[str] = field(default_factory=list)
    
    # Images
    images: List[Dict[str, Any]] = field(default_factory=list)
    
    # External URLs
    external_urls: Dict[str, str] = field(default_factory=dict)
    
    # Raw data
    raw_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ArtistLastFmData:
    """Last.fm artist-specific data."""
    name: Optional[str] = None
    url: Optional[str] = None
    mbid: Optional[str] = None
    
    # Statistics
    listeners: Optional[int] = None
    playcount: Optional[int] = None
    
    # Content
    bio_summary: Optional[str] = None
    bio_content: Optional[str] = None
    
    # Tags and related
    tags: List[str] = field(default_factory=list)
    similar_artists: List[Dict[str, Any]] = field(default_factory=list)
    
    # Images
    images: List[Dict[str, Any]] = field(default_factory=list)
    
    # Top content
    top_albums: List[Dict[str, Any]] = field(default_factory=list)
    top_tracks: List[Dict[str, Any]] = field(default_factory=list)
    
    # Raw data
    raw_data: Dict[str, Any] = field(default_factory=dict)