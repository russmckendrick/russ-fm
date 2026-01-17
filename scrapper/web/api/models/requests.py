"""Pydantic request models for API endpoints."""

from typing import Optional, List
from pydantic import BaseModel, Field


class ProcessReleaseRequest(BaseModel):
    """Request to process/enrich a release."""

    force_refresh: bool = Field(default=False, description="Force refresh from APIs")
    interactive: bool = Field(default=False, description="Enable interactive mode")
    search_override: Optional[str] = Field(default=None, description="Custom search query")
    custom_cover: Optional[str] = Field(default=None, description="Custom cover URL")
    prefer_source: Optional[str] = Field(
        default=None, description="Preferred image source"
    )


class ProcessCollectionRequest(BaseModel):
    """Request to process collection."""

    username: Optional[str] = Field(default=None, description="Discogs username")
    limit: Optional[int] = Field(default=None, description="Max items to process")
    from_index: Optional[int] = Field(default=None, description="Start index")
    to_index: Optional[int] = Field(default=None, description="End index")
    batch_size: int = Field(default=10, description="Batch size")
    resume: bool = Field(default=False, description="Resume from last position")
    force_refresh: bool = Field(default=False, description="Force refresh from APIs")
    interactive: bool = Field(default=False, description="Enable interactive mode")
    prefer_source: Optional[str] = Field(
        default=None, description="Preferred image source"
    )


class ProcessArtistRequest(BaseModel):
    """Request to process/enrich an artist."""

    force_refresh: bool = Field(default=False, description="Force refresh from APIs")
    interactive: bool = Field(default=False, description="Enable interactive mode")
    custom_image: Optional[str] = Field(default=None, description="Custom image URL")
    prefer_source: Optional[str] = Field(
        default=None, description="Preferred image source"
    )
    save: bool = Field(default=True, description="Save to database")


class EnrichDescriptionRequest(BaseModel):
    """Request to enrich album descriptions."""

    discogs_ids: List[str] = Field(
        default_factory=list, description="List of Discogs IDs to process"
    )
    from_id: Optional[str] = Field(
        default=None, description="Start from this ID and work backwards"
    )
    batch_size: int = Field(default=50, description="Batch size for processing")
    force: bool = Field(default=False, description="Force regenerate existing")
    dry_run: bool = Field(default=False, description="Preview without saving")


class TaskInteractiveResponse(BaseModel):
    """Response to interactive task prompt."""

    selection: int = Field(description="Selected option index (0 to skip)")


class BackupRequest(BaseModel):
    """Request to create database backup."""

    backup_path: Optional[str] = Field(default=None, description="Custom backup path")


class GenerateCollectionRequest(BaseModel):
    """Request to generate collection.json."""

    output_path: Optional[str] = Field(default=None, description="Custom output path")
    data_path: Optional[str] = Field(default=None, description="Data directory path")
