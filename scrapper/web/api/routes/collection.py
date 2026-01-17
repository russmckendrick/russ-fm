"""Collection processing API routes."""

import logging
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from ...dependencies import get_database, get_orchestrator, get_config
from ...core.auth import get_current_user
from ...core.task_manager import task_manager, Task
from ..models.requests import ProcessCollectionRequest
from ..models.responses import (
    ReleaseListResponse,
    ReleaseListItem,
    TaskCreateResponse,
    TaskStatus,
)


router = APIRouter(prefix="/api/v1/collection", tags=["collection"])
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
async def list_collection(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    processed: Optional[bool] = None,
    user: str = Depends(get_current_user),
):
    """List collection items with pagination."""
    db = get_database()

    try:
        import sqlite3
        with sqlite3.connect(db.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # Build query
            where_clause = ""
            params = []
            if processed is not None:
                where_clause = "WHERE ci.processed = ?"
                params = [processed]

            # Get total count
            count_query = f"""
                SELECT COUNT(*) FROM collection_items ci
                JOIN releases r ON ci.release_id = r.id
                {where_clause}
            """
            cursor = conn.execute(count_query, params)
            total = cursor.fetchone()[0]

            # Get paginated results
            offset = (page - 1) * per_page
            query = f"""
                SELECT r.discogs_id, r.title, r.artists, r.year,
                       r.apple_music_id, r.spotify_id, r.lastfm_url, r.local_images, r.raw_data,
                       ci.processed, ci.enriched
                FROM collection_items ci
                JOIN releases r ON ci.release_id = r.id
                {where_clause}
                ORDER BY ci.date_added DESC
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
        logger.error(f"Failed to list collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process", response_model=TaskCreateResponse)
async def process_collection(
    request: ProcessCollectionRequest,
    user: str = Depends(get_current_user),
):
    """Start processing the collection (creates a background task)."""
    task = await task_manager.create_task(
        task_type="process_collection",
        params={
            "username": request.username,
            "limit": request.limit,
            "from_index": request.from_index,
            "to_index": request.to_index,
            "batch_size": request.batch_size,
            "resume": request.resume,
            "force_refresh": request.force_refresh,
            "interactive": request.interactive,
            "prefer_source": request.prefer_source,
        },
    )

    return TaskCreateResponse(
        task_id=task.task_id,
        status=TaskStatus(task.status.value),
        message="Collection processing started",
    )


@router.get("/progress")
async def get_collection_progress(user: str = Depends(get_current_user)):
    """Get current collection processing progress."""
    db = get_database()
    stats = db.get_stats()

    total = stats.get("total_collection_items", 0)
    processed = stats.get("processed_items", 0)
    enriched = stats.get("enriched_items", 0)

    return {
        "total": total,
        "processed": processed,
        "enriched": enriched,
        "progress_percent": (processed / total * 100) if total > 0 else 0,
        "enrichment_percent": (enriched / total * 100) if total > 0 else 0,
    }


# Task handler for processing collection
async def handle_process_collection(task: Task, manager):
    """Handle the process_collection task."""
    await manager.update_progress(task.task_id, 5, "Starting collection processing")
    await manager.log_task(task.task_id, "info", "Starting collection processing")

    try:
        config = get_config()
        orchestrator = get_orchestrator()
        db = get_database()

        # Set options
        if task.params.get("prefer_source"):
            orchestrator.set_preferred_image_source(task.params["prefer_source"])
        if task.params.get("interactive"):
            orchestrator.set_interactive_mode(True)

        # Get username
        username = task.params.get("username") or config.get("discogs.username")

        await manager.update_progress(task.task_id, 10, f"Fetching collection for {username}")
        await manager.log_task(task.task_id, "info", f"Fetching collection for user: {username}")

        # Get collection items
        collection_items = orchestrator.get_collection_items(username)

        if not collection_items:
            raise Exception("No collection items found")

        await manager.log_task(task.task_id, "info", f"Found {len(collection_items)} items in collection")

        # Apply index limits
        from_idx = task.params.get("from_index") or 0
        to_idx = task.params.get("to_index") or len(collection_items)
        limit = task.params.get("limit")

        if limit:
            to_idx = min(from_idx + limit, to_idx)

        items_to_process = collection_items[from_idx:to_idx]
        total_items = len(items_to_process)

        await manager.log_task(
            task.task_id, "info",
            f"Processing items {from_idx} to {to_idx} ({total_items} total)"
        )

        processed_count = 0
        error_count = 0

        for i, item in enumerate(items_to_process):
            if task.status.value == "cancelled":
                await manager.log_task(task.task_id, "info", "Processing cancelled by user")
                break

            try:
                # Parse collection item
                collection_item = orchestrator.services["discogs"].parse_collection_item(item)
                discogs_id = str(collection_item.release.discogs_id)

                # Check if already processed (resume mode)
                if task.params.get("resume") and db.has_enriched_release(discogs_id):
                    await manager.log_task(task.task_id, "debug", f"Skipping {discogs_id} - already enriched")
                    continue

                progress = 10 + ((i + 1) / total_items * 80)
                await manager.update_progress(
                    task.task_id,
                    progress,
                    f"Processing {collection_item.release.title} ({i + 1}/{total_items})"
                )

                # Enrich release
                enriched_release = orchestrator.enrich_release(collection_item.release)

                # Save to database
                db.save_release(enriched_release)
                collection_item.release = enriched_release
                collection_item.enriched = True
                db.save_collection_item(collection_item)

                await manager.log_task(
                    task.task_id, "info",
                    f"Processed: {enriched_release.title}"
                )
                processed_count += 1

            except Exception as e:
                error_count += 1
                await manager.log_task(
                    task.task_id, "error",
                    f"Failed to process item: {str(e)}"
                )

        await manager.update_progress(task.task_id, 100, "Completed")
        await manager.log_task(
            task.task_id, "info",
            f"Collection processing completed. Processed: {processed_count}, Errors: {error_count}"
        )

        task.result = {
            "processed": processed_count,
            "errors": error_count,
            "total": total_items,
        }

    except Exception as e:
        await manager.log_task(task.task_id, "error", str(e))
        raise


# Register the handler
task_manager.register_handler("process_collection", handle_process_collection)
