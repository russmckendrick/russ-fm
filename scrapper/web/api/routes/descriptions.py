"""Description enrichment API routes."""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from ...dependencies import get_database, get_config
from ...core.auth import get_current_user
from ...core.task_manager import task_manager, Task
from ..models.requests import EnrichDescriptionRequest
from ..models.responses import (
    DescriptionMissingResponse,
    DescriptionMissingItem,
    TaskCreateResponse,
    TaskStatus,
)


router = APIRouter(prefix="/api/v1/descriptions", tags=["descriptions"])
logger = logging.getLogger(__name__)


@router.get("/missing", response_model=DescriptionMissingResponse)
async def list_missing_descriptions(
    limit: int = Query(50, ge=1, le=500),
    user: str = Depends(get_current_user),
):
    """List albums that are missing descriptions."""
    db = get_database()

    try:
        releases = db.get_releases_without_description(limit=limit)

        items = []
        for release in releases:
            items.append(
                DescriptionMissingItem(
                    discogs_id=release["discogs_id"],
                    title=release["title"],
                    artists=release["artists"],
                    year=release["year"],
                    has_apple_music=False,  # These have no descriptions
                    has_lastfm=False,
                )
            )

        return DescriptionMissingResponse(
            items=items,
            total=len(items),
        )

    except Exception as e:
        logger.error(f"Failed to list missing descriptions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/enrich", response_model=TaskCreateResponse)
async def enrich_descriptions(
    request: EnrichDescriptionRequest,
    user: str = Depends(get_current_user),
):
    """Enrich album descriptions using Perplexity AI (creates a background task)."""
    # Check Perplexity configuration
    config = get_config()
    if not config.get("perplexity.api_key"):
        raise HTTPException(
            status_code=400,
            detail="Perplexity API key not configured"
        )

    task = await task_manager.create_task(
        task_type="enrich_descriptions",
        params={
            "discogs_ids": request.discogs_ids,
            "from_id": request.from_id,
            "batch_size": request.batch_size,
            "force": request.force,
            "dry_run": request.dry_run,
        },
    )

    return TaskCreateResponse(
        task_id=task.task_id,
        status=TaskStatus(task.status.value),
        message="Description enrichment started",
    )


# Task handler for enriching descriptions
async def handle_enrich_descriptions(task: Task, manager):
    """Handle the enrich_descriptions task."""
    await manager.update_progress(task.task_id, 5, "Starting description enrichment")
    await manager.log_task(task.task_id, "info", "Starting description enrichment")

    try:
        from music_collection_manager.services.perplexity import PerplexityService
        from music_collection_manager.utils.json_updater import JsonUpdater

        config = get_config()
        db = get_database()

        # Initialize Perplexity service
        perplexity_config = config.get_section("perplexity")
        perplexity_service = PerplexityService(perplexity_config, logger)

        json_updater = JsonUpdater(logger=logger)

        # Determine releases to process
        releases_to_process = []

        if task.params.get("from_id"):
            # Get releases from ID backwards
            await manager.log_task(
                task.task_id, "info",
                f"Fetching releases from {task.params['from_id']} backwards"
            )
            releases_to_process = db.get_releases_from_id_backwards(
                task.params["from_id"]
            )
        elif task.params.get("discogs_ids"):
            # Process specific IDs
            for discogs_id in task.params["discogs_ids"]:
                release = db.search_release_by_title("", None)  # Get by ID
                import sqlite3
                import json as json_module
                with sqlite3.connect(db.db_path) as conn:
                    conn.row_factory = sqlite3.Row
                    cursor = conn.execute(
                        "SELECT discogs_id, title, artists, year, genres, labels FROM releases WHERE discogs_id = ?",
                        (discogs_id,)
                    )
                    row = cursor.fetchone()
                    if row:
                        artists_data = json_module.loads(row["artists"] or "[]")
                        releases_to_process.append({
                            "discogs_id": row["discogs_id"],
                            "title": row["title"],
                            "artists": [a.get("name", "") for a in artists_data],
                            "year": row["year"],
                            "genres": json_module.loads(row["genres"] or "[]"),
                            "labels": json_module.loads(row["labels"] or "[]"),
                        })
        else:
            # Get releases missing descriptions
            releases_to_process = db.get_releases_without_description(limit=500)

        if not releases_to_process:
            await manager.update_progress(task.task_id, 100, "No releases to process")
            await manager.log_task(task.task_id, "info", "No releases found to process")
            task.result = {"processed": 0, "skipped": 0, "errors": 0}
            return

        await manager.log_task(
            task.task_id, "info",
            f"Found {len(releases_to_process)} releases to process"
        )

        total = len(releases_to_process)
        processed = 0
        skipped = 0
        errors = 0
        batch_size = task.params.get("batch_size", 50)

        for i, release in enumerate(releases_to_process):
            if task.status.value == "cancelled":
                await manager.log_task(task.task_id, "info", "Processing cancelled by user")
                break

            discogs_id = release["discogs_id"]
            title = release["title"]
            artists = release["artists"]

            # Check existing descriptions
            desc_status = json_updater.check_album_has_description(
                discogs_id, title, artists
            )

            has_good_desc = desc_status["apple_music"] or desc_status["perplexity"]

            if has_good_desc and not task.params.get("force"):
                skipped += 1
                continue

            progress = 5 + ((i + 1) / total * 90)
            await manager.update_progress(
                task.task_id,
                progress,
                f"Processing: {title} ({i + 1}/{total})"
            )

            try:
                primary_artist = artists[0] if artists else ""

                # Generate description
                description_data = perplexity_service.generate_album_description(
                    artist=primary_artist,
                    album=title,
                    year=release.get("year"),
                    genres=release.get("genres", []),
                    labels=release.get("labels", []),
                )

                if not description_data:
                    await manager.log_task(
                        task.task_id, "warning",
                        f"Failed to generate description for {title}"
                    )
                    errors += 1
                    continue

                if not task.params.get("dry_run"):
                    # Save to database
                    db.update_release_perplexity_description(discogs_id, description_data)

                    # Save to JSON file
                    json_updater.update_album_perplexity_description(
                        discogs_id, title, artists, description_data
                    )

                await manager.log_task(
                    task.task_id, "info",
                    f"Generated description for: {title}"
                )
                processed += 1

                # Batch pause
                if processed > 0 and processed % batch_size == 0:
                    await manager.log_task(
                        task.task_id, "info",
                        f"Batch of {batch_size} completed. Total processed: {processed}"
                    )

            except Exception as e:
                errors += 1
                await manager.log_task(
                    task.task_id, "error",
                    f"Error processing {title}: {str(e)}"
                )

        await manager.update_progress(task.task_id, 100, "Completed")
        await manager.log_task(
            task.task_id, "info",
            f"Description enrichment completed. Processed: {processed}, Skipped: {skipped}, Errors: {errors}"
        )

        task.result = {
            "processed": processed,
            "skipped": skipped,
            "errors": errors,
            "total": total,
        }

    except Exception as e:
        await manager.log_task(task.task_id, "error", str(e))
        raise


# Register the handler
task_manager.register_handler("enrich_descriptions", handle_enrich_descriptions)
