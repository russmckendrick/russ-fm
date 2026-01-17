"""Release management API routes."""

import logging
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from ...dependencies import get_database, get_orchestrator, get_config
from ...core.auth import get_current_user
from ...core.task_manager import task_manager, Task
from ..models.requests import ProcessReleaseRequest
from ..models.responses import (
    ReleaseListResponse,
    ReleaseListItem,
    ReleaseDetailResponse,
    TaskCreateResponse,
    TaskStatus,
)


router = APIRouter(prefix="/api/v1/releases", tags=["releases"])
logger = logging.getLogger(__name__)


def transform_image_path(path: Optional[str]) -> Optional[str]:
    """Transform database image paths to web-accessible URLs.

    Converts paths like '../public/album/xyz/image.jpg' to '/album/xyz/image.jpg'
    """
    if not path:
        return None
    # Remove the ../public prefix to match mounted static paths
    if path.startswith("../public/"):
        return "/" + path[10:]  # Strip '../public/' (10 chars)
    return path


def transform_image_dict(images: dict) -> dict:
    """Transform all paths in an images dictionary."""
    return {k: transform_image_path(v) for k, v in images.items()}


@router.get("", response_model=ReleaseListResponse)
async def list_releases(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    user: str = Depends(get_current_user),
):
    """List releases with pagination and optional search."""
    db = get_database()

    try:
        import sqlite3
        with sqlite3.connect(db.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # Build query
            where_clause = ""
            params = []
            if search:
                where_clause = "WHERE title LIKE ? OR artists LIKE ?"
                params = [f"%{search}%", f"%{search}%"]

            # Get total count
            count_query = f"SELECT COUNT(*) FROM releases {where_clause}"
            cursor = conn.execute(count_query, params)
            total = cursor.fetchone()[0]

            # Get paginated results
            offset = (page - 1) * per_page
            query = f"""
                SELECT discogs_id, title, artists, year,
                       apple_music_id, spotify_id, lastfm_url, local_images, raw_data
                FROM releases
                {where_clause}
                ORDER BY date_added DESC, title ASC
                LIMIT ? OFFSET ?
            """
            cursor = conn.execute(query, params + [per_page, offset])
            rows = cursor.fetchall()

            items = []
            for row in rows:
                artists_data = json.loads(row["artists"] or "[]")
                artist_names = [a.get("name", "") for a in artists_data]
                local_images = transform_image_dict(json.loads(row["local_images"] or "{}"))

                # Parse raw_data safely
                raw_data_str = row["raw_data"] or "{}"
                try:
                    raw_data = json.loads(raw_data_str) if isinstance(raw_data_str, str) else raw_data_str
                except (json.JSONDecodeError, TypeError):
                    raw_data = {}

                # Check for description - handle both data structures
                has_desc = False
                if isinstance(raw_data, dict):
                    services = raw_data.get("services", {}) if isinstance(raw_data.get("services"), dict) else {}
                    am_data = services.get("apple_music") or raw_data.get("apple_music")
                    lf_data = services.get("lastfm") or raw_data.get("lastfm")
                    px_data = services.get("perplexity") or raw_data.get("perplexity")

                    has_desc = bool(
                        (isinstance(am_data, dict) and (am_data.get("raw_attributes", {}).get("editorialNotes") or am_data.get("editorialNotes")))
                        or (isinstance(lf_data, dict) and (lf_data.get("wiki_summary") or lf_data.get("wiki_content")))
                        or (isinstance(px_data, dict) and px_data.get("description"))
                    )

                items.append(
                    ReleaseListItem(
                        discogs_id=row["discogs_id"],
                        title=row["title"],
                        artists=artist_names,
                        year=row["year"],
                        has_apple_music=bool(row["apple_music_id"]),
                        has_spotify=bool(row["spotify_id"]),
                        has_lastfm=bool(row["lastfm_url"]),
                        has_description=has_desc,
                        thumbnail_url=local_images.get("hi-res"),
                    )
                )

            total_pages = (total + per_page - 1) // per_page

            return ReleaseListResponse(
                items=items,
                total=total,
                page=page,
                per_page=per_page,
                total_pages=total_pages,
            )

    except Exception as e:
        logger.error(f"Failed to list releases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{discogs_id}", response_model=ReleaseDetailResponse)
async def get_release(discogs_id: str, user: str = Depends(get_current_user)):
    """Get detailed release information."""
    db = get_database()

    release = db.get_release_by_discogs_id(discogs_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    # Build response
    artists = [
        {
            "name": a.name,
            "role": a.role,
            "discogs_id": a.discogs_id,
            "apple_music_id": a.apple_music_id,
            "spotify_id": a.spotify_id,
        }
        for a in release.artists
    ]
    images = [
        {"url": i.url, "type": i.type, "width": i.width, "height": i.height}
        for i in release.images
    ]
    tracklist = [
        {
            "position": t.position,
            "title": t.title,
            "duration": t.duration,
            "artists": [{"name": ta.name, "role": ta.role} for ta in t.artists] if t.artists else [],
        }
        for t in release.tracklist
    ]
    local_images = transform_image_dict({k: str(v) if v else None for k, v in (release.local_images or {}).items()})

    # Get service data - handle both structures (services.X or X at root)
    raw = release.raw_data or {}
    if not isinstance(raw, dict):
        raw = {}
    services = raw.get("services", {})
    if not isinstance(services, dict):
        services = {}

    # Helper to safely get dict
    def safe_dict(val):
        return val if isinstance(val, dict) else {}

    # Extract Apple Music data - check both locations
    apple_music_service = safe_dict(services.get("apple_music") or raw.get("apple_music"))
    apple_music_attrs = safe_dict(apple_music_service.get("raw_attributes"))
    editorial_notes = safe_dict(apple_music_attrs.get("editorialNotes"))
    apple_music_desc = (
        editorial_notes.get("standard")
        or editorial_notes.get("short")
        or apple_music_service.get("editorial_notes")
    )

    # Extract Last.fm data - check both locations
    lastfm_service = safe_dict(services.get("lastfm") or raw.get("lastfm"))
    lastfm_desc = lastfm_service.get("wiki_content") or lastfm_service.get("wiki_summary")

    # Extract Perplexity data - check both locations
    perplexity_service = safe_dict(services.get("perplexity") or raw.get("perplexity"))
    perplexity_desc = perplexity_service.get("description")

    # Extract Spotify data - check both locations
    spotify_service = safe_dict(services.get("spotify") or raw.get("spotify"))

    # Check description availability
    has_apple_desc = bool(apple_music_desc)
    has_lastfm_desc = bool(lastfm_desc)
    has_perplexity_desc = bool(perplexity_desc)

    # Build Apple Music data summary
    apple_music_data = None
    if apple_music_service:
        apple_music_data = {
            "name": apple_music_attrs.get("name"),
            "artist_name": apple_music_attrs.get("artistName"),
            "release_date": apple_music_attrs.get("releaseDate"),
            "record_label": apple_music_attrs.get("recordLabel"),
            "track_count": apple_music_attrs.get("trackCount"),
            "genre_names": apple_music_attrs.get("genreNames", []),
            "content_rating": apple_music_attrs.get("contentRating"),
            "is_complete": apple_music_attrs.get("isComplete"),
            "is_single": apple_music_attrs.get("isSingle"),
            "is_compilation": apple_music_attrs.get("isCompilation"),
        }

    # Build Spotify data summary
    spotify_data = None
    if spotify_service:
        spotify_data = {
            "name": spotify_service.get("name"),
            "album_type": spotify_service.get("album_type"),
            "release_date": spotify_service.get("release_date"),
            "total_tracks": spotify_service.get("total_tracks"),
            "popularity": spotify_service.get("popularity"),
            "label": spotify_service.get("label"),
            "copyrights": spotify_service.get("copyrights", []),
            "external_ids": safe_dict(spotify_service.get("external_ids")),
        }

    # Build Last.fm data summary
    lastfm_data = None
    if lastfm_service:
        lastfm_data = {
            "name": lastfm_service.get("name"),
            "artist": lastfm_service.get("artist"),
            "playcount": lastfm_service.get("playcount"),
            "listeners": lastfm_service.get("listeners"),
            "tags": lastfm_service.get("tags", []),
            "wiki_published": lastfm_service.get("wiki_published"),
        }

    return ReleaseDetailResponse(
        discogs_id=release.discogs_id,
        title=release.title,
        artists=artists,
        year=release.year,
        released=release.released,
        country=release.country,
        formats=release.formats,
        labels=release.labels,
        genres=release.genres,
        styles=release.styles,
        tracklist=tracklist,
        videos=release.videos or [],
        apple_music_id=release.apple_music_id,
        apple_music_url=release.apple_music_url,
        spotify_id=release.spotify_id,
        spotify_url=release.spotify_url,
        lastfm_url=release.lastfm_url,
        discogs_url=release.discogs_url,
        images=images,
        local_images=local_images,
        has_apple_music_desc=has_apple_desc,
        has_lastfm_desc=has_lastfm_desc,
        has_perplexity_desc=has_perplexity_desc,
        apple_music_description=apple_music_desc,
        lastfm_description=lastfm_desc,
        perplexity_description=perplexity_desc,
        apple_music_data=apple_music_data,
        spotify_data=spotify_data,
        lastfm_data=lastfm_data,
        date_added=release.date_added,
        updated_at=release.updated_at,
        created_at=release.created_at,
    )


@router.post("/{discogs_id}", response_model=TaskCreateResponse)
async def process_release(
    discogs_id: str,
    request: ProcessReleaseRequest,
    user: str = Depends(get_current_user),
):
    """Process/enrich a release (creates a background task)."""
    task = await task_manager.create_task(
        task_type="process_release",
        params={
            "discogs_id": discogs_id,
            "force_refresh": request.force_refresh,
            "interactive": request.interactive,
            "search_override": request.search_override,
            "custom_cover": request.custom_cover,
            "prefer_source": request.prefer_source,
        },
    )

    return TaskCreateResponse(
        task_id=task.task_id,
        status=TaskStatus(task.status.value),
        message=f"Processing release {discogs_id}",
    )


# Task handler for processing releases
async def handle_process_release(task: Task, manager):
    """Handle the process_release task."""
    discogs_id = task.params.get("discogs_id")

    await manager.update_progress(task.task_id, 10, f"Fetching release {discogs_id}")
    await manager.log_task(task.task_id, "info", f"Starting to process release {discogs_id}")

    try:
        orchestrator = get_orchestrator()

        # Apply options
        if task.params.get("search_override"):
            orchestrator.set_search_override(task.params["search_override"])
        if task.params.get("custom_cover"):
            orchestrator.set_custom_cover(task.params["custom_cover"])
        if task.params.get("prefer_source"):
            orchestrator.set_preferred_image_source(task.params["prefer_source"])

        # Process release
        await manager.update_progress(task.task_id, 30, "Fetching from Discogs")
        release = orchestrator.get_release_by_discogs_id(
            discogs_id, force_refresh=task.params.get("force_refresh", False)
        )

        if not release:
            raise Exception(f"Release {discogs_id} not found")

        await manager.update_progress(task.task_id, 90, "Saving to database")
        db = get_database()
        db.save_release(release)

        await manager.update_progress(task.task_id, 100, "Completed")
        await manager.log_task(task.task_id, "info", f"Successfully processed release: {release.title}")

        task.result = {
            "discogs_id": discogs_id,
            "title": release.title,
            "artists": [a.name for a in release.artists],
        }

    except Exception as e:
        await manager.log_task(task.task_id, "error", str(e))
        raise


# Register the handler
task_manager.register_handler("process_release", handle_process_release)
