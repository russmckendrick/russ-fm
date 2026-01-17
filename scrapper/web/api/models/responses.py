"""Pydantic response models for API endpoints."""

from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """Task status enumeration."""

    PENDING = "pending"
    RUNNING = "running"
    AWAITING_INPUT = "awaiting_input"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ServiceStatus(BaseModel):
    """Status of a single service."""

    name: str
    configured: bool
    connected: bool = False
    error: Optional[str] = None


class StatusResponse(BaseModel):
    """Overall system status response."""

    database_exists: bool
    database_path: str
    total_releases: int = 0
    total_artists: int = 0
    total_collection_items: int = 0
    processed_items: int = 0
    enriched_items: int = 0
    services: List[ServiceStatus] = Field(default_factory=list)


class ReleaseListItem(BaseModel):
    """Brief release info for list views."""

    discogs_id: str
    title: str
    artists: List[str]
    year: Optional[int]
    has_apple_music: bool = False
    has_spotify: bool = False
    has_lastfm: bool = False
    has_description: bool = False
    thumbnail_url: Optional[str] = None


class ReleaseListResponse(BaseModel):
    """Paginated list of releases."""

    items: List[ReleaseListItem]
    total: int
    page: int
    per_page: int
    total_pages: int


class ReleaseDetailResponse(BaseModel):
    """Detailed release information."""

    discogs_id: str
    title: str
    artists: List[Dict[str, Any]]
    year: Optional[int]
    released: Optional[str]
    country: Optional[str]
    formats: List[str]
    labels: List[str]
    genres: List[str]
    styles: List[str]
    tracklist: List[Dict[str, Any]]
    videos: List[str] = Field(default_factory=list)

    # External IDs and URLs
    apple_music_id: Optional[str]
    apple_music_url: Optional[str]
    spotify_id: Optional[str]
    spotify_url: Optional[str]
    lastfm_url: Optional[str]
    discogs_url: Optional[str]
    wikipedia_url: Optional[str] = None

    # Images
    images: List[Dict[str, Any]]
    local_images: Dict[str, str]

    # Description status
    has_apple_music_desc: bool = False
    has_lastfm_desc: bool = False
    has_perplexity_desc: bool = False

    # Actual descriptions
    apple_music_description: Optional[str] = None
    lastfm_description: Optional[str] = None
    perplexity_description: Optional[str] = None

    # Service-specific data
    apple_music_data: Optional[Dict[str, Any]] = None
    spotify_data: Optional[Dict[str, Any]] = None
    lastfm_data: Optional[Dict[str, Any]] = None

    # Metadata
    date_added: Optional[datetime]
    updated_at: Optional[datetime]
    created_at: Optional[datetime] = None


class ArtistListItem(BaseModel):
    """Brief artist info for list views."""

    id: str
    name: str
    release_count: int = 0
    has_apple_music: bool = False
    has_spotify: bool = False
    has_biography: bool = False
    avatar_url: Optional[str] = None


class ArtistListResponse(BaseModel):
    """Paginated list of artists."""

    items: List[ArtistListItem]
    total: int
    page: int
    per_page: int
    total_pages: int


class ArtistDetailResponse(BaseModel):
    """Detailed artist information."""

    id: str
    name: str
    biography: Optional[str]
    genres: List[str]

    # External IDs and URLs
    discogs_id: Optional[str]
    discogs_url: Optional[str]
    apple_music_id: Optional[str]
    apple_music_url: Optional[str]
    spotify_id: Optional[str]
    spotify_url: Optional[str]
    lastfm_url: Optional[str]
    wikipedia_url: Optional[str]

    # Stats
    popularity: Optional[int]
    followers: Optional[int]

    # Images
    images: List[Dict[str, Any]]
    local_images: Dict[str, str]

    # Metadata
    updated_at: Optional[datetime]


class TaskInfo(BaseModel):
    """Task information."""

    task_id: str
    task_type: str
    status: TaskStatus
    progress: float = 0.0
    message: str = ""
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None

    # For interactive tasks
    awaiting_input: bool = False
    input_options: Optional[List[Dict[str, Any]]] = None
    input_prompt: Optional[str] = None


class TaskListResponse(BaseModel):
    """List of tasks."""

    tasks: List[TaskInfo]
    total: int


class TaskCreateResponse(BaseModel):
    """Response when creating a new task."""

    task_id: str
    status: TaskStatus
    message: str


class DescriptionMissingItem(BaseModel):
    """Album missing description."""

    discogs_id: str
    title: str
    artists: List[str]
    year: Optional[int]
    has_apple_music: bool = False
    has_lastfm: bool = False


class DescriptionMissingResponse(BaseModel):
    """List of albums missing descriptions."""

    items: List[DescriptionMissingItem]
    total: int


class MatchingReportItem(BaseModel):
    """Matching report item."""

    discogs_id: str
    discogs_title: str
    apple_music_title: Optional[str]
    spotify_title: Optional[str]
    match_quality: str  # "exact", "partial", "mismatch", "missing"


class MatchingReportResponse(BaseModel):
    """Matching report response."""

    items: List[MatchingReportItem]
    total: int
    exact_matches: int
    partial_matches: int
    mismatches: int
    missing: int


class BackupResponse(BaseModel):
    """Backup operation response."""

    success: bool
    backup_path: Optional[str] = None
    message: str


class GenerateCollectionResponse(BaseModel):
    """Generate collection response."""

    success: bool
    output_path: Optional[str] = None
    total_entries: int = 0
    message: str


class ErrorResponse(BaseModel):
    """Error response."""

    error: str
    detail: Optional[str] = None
