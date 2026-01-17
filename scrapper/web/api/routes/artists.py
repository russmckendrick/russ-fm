"""Artist management API routes."""

import logging
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from ...dependencies import get_database, get_artist_orchestrator
from ...core.auth import get_current_user
from ...core.task_manager import task_manager, Task
from ..models.requests import ProcessArtistRequest
from ..models.responses import (
    ArtistListResponse,
    ArtistListItem,
    ArtistDetailResponse,
    TaskCreateResponse,
    TaskStatus,
)


router = APIRouter(prefix="/api/v1/artists", tags=["artists"])
logger = logging.getLogger(__name__)


def transform_image_path(path: Optional[str]) -> Optional[str]:
    """Transform database image paths to web-accessible URLs.

    Converts paths like '../public/artist/xyz/image.jpg' to '/artist/xyz/image.jpg'
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


@router.get("", response_model=ArtistListResponse)
async def list_artists(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    user: str = Depends(get_current_user),
):
    """List artists with pagination and optional search."""
    db = get_database()

    try:
        import sqlite3
        with sqlite3.connect(db.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # Build query
            where_clause = ""
            params = []
            if search:
                where_clause = "WHERE a.name LIKE ?"
                params = [f"%{search}%"]

            # Get total count
            count_query = f"SELECT COUNT(*) FROM artists a {where_clause}"
            cursor = conn.execute(count_query, params)
            total = cursor.fetchone()[0]

            # Get paginated results with release count
            offset = (page - 1) * per_page
            query = f"""
                SELECT a.id, a.name, a.apple_music_id, a.spotify_id, a.biography, a.local_images,
                       COUNT(DISTINCT r.id) as release_count
                FROM artists a
                LEFT JOIN releases r ON r.artists LIKE '%' || a.name || '%'
                {where_clause}
                GROUP BY a.id
                ORDER BY release_count DESC, a.name ASC
                LIMIT ? OFFSET ?
            """
            cursor = conn.execute(query, params + [per_page, offset])
            rows = cursor.fetchall()

            items = []
            for row in rows:
                local_images = transform_image_dict(json.loads(row["local_images"] or "{}"))

                items.append(
                    ArtistListItem(
                        id=row["id"],
                        name=row["name"],
                        release_count=row["release_count"],
                        has_apple_music=bool(row["apple_music_id"]),
                        has_spotify=bool(row["spotify_id"]),
                        has_biography=bool(row["biography"]),
                        avatar_url=local_images.get("hi-res"),
                    )
                )

            total_pages = (total + per_page - 1) // per_page

            return ArtistListResponse(
                items=items,
                total=total,
                page=page,
                per_page=per_page,
                total_pages=total_pages,
            )

    except Exception as e:
        logger.error(f"Failed to list artists: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{artist_name}", response_model=ArtistDetailResponse)
async def get_artist(artist_name: str, user: str = Depends(get_current_user)):
    """Get detailed artist information."""
    db = get_database()

    # URL decode the artist name
    from urllib.parse import unquote
    artist_name = unquote(artist_name)

    artist = db.get_artist_by_name(artist_name)
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")

    # Build response
    images = [{"url": i.url, "type": i.type} for i in (artist.images or [])]
    local_images = transform_image_dict({k: str(v) if v else None for k, v in (artist.local_images or {}).items()})

    return ArtistDetailResponse(
        id=artist.id,
        name=artist.name,
        biography=artist.biography,
        genres=artist.genres or [],
        discogs_id=artist.discogs_id,
        discogs_url=artist.discogs_url,
        apple_music_id=artist.apple_music_id,
        apple_music_url=artist.apple_music_url,
        spotify_id=artist.spotify_id,
        spotify_url=artist.spotify_url,
        lastfm_url=artist.lastfm_url,
        wikipedia_url=artist.wikipedia_url,
        popularity=artist.popularity,
        followers=artist.followers,
        images=images,
        local_images=local_images,
        updated_at=artist.updated_at,
    )


@router.post("/{artist_name}", response_model=TaskCreateResponse)
async def process_artist(
    artist_name: str,
    request: ProcessArtistRequest,
    user: str = Depends(get_current_user),
):
    """Process/enrich an artist (creates a background task)."""
    from urllib.parse import unquote
    artist_name = unquote(artist_name)

    task = await task_manager.create_task(
        task_type="process_artist",
        params={
            "artist_name": artist_name,
            "force_refresh": request.force_refresh,
            "interactive": request.interactive,
            "custom_image": request.custom_image,
            "prefer_source": request.prefer_source,
            "save": request.save,
        },
    )

    return TaskCreateResponse(
        task_id=task.task_id,
        status=TaskStatus(task.status.value),
        message=f"Processing artist {artist_name}",
    )


# Task handler for processing artists
async def handle_process_artist(task: Task, manager):
    """Handle the process_artist task."""
    artist_name = task.params.get("artist_name")

    await manager.update_progress(task.task_id, 10, f"Fetching artist {artist_name}")
    await manager.log_task(task.task_id, "info", f"Starting to process artist: {artist_name}")

    try:
        orchestrator = get_artist_orchestrator()

        # Apply options
        if task.params.get("custom_image"):
            orchestrator.set_custom_image(task.params["custom_image"])
        if task.params.get("prefer_source"):
            orchestrator.set_preferred_image_source(task.params["prefer_source"])
        if task.params.get("interactive"):
            orchestrator.set_interactive_mode(True)

        await manager.update_progress(task.task_id, 30, "Fetching from services")

        # Process artist
        artist = orchestrator.get_artist_by_name(
            artist_name, force_refresh=task.params.get("force_refresh", False)
        )

        if not artist:
            raise Exception(f"Artist '{artist_name}' not found")

        await manager.update_progress(task.task_id, 80, "Processing complete")

        # Save to database if requested
        if task.params.get("save", True):
            await manager.update_progress(task.task_id, 90, "Saving to database")
            db = get_database()
            db.save_artist(artist)

        await manager.update_progress(task.task_id, 100, "Completed")
        await manager.log_task(task.task_id, "info", f"Successfully processed artist: {artist.name}")

        task.result = {
            "name": artist.name,
            "apple_music_id": artist.apple_music_id,
            "spotify_id": artist.spotify_id,
            "has_biography": bool(artist.biography),
        }

    except Exception as e:
        await manager.log_task(task.task_id, "error", str(e))
        raise


# Register the handler
task_manager.register_handler("process_artist", handle_process_artist)
