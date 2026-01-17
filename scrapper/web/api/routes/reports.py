"""Report generation API routes."""

import logging
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException

from ...dependencies import get_database, get_config
from ...core.auth import get_current_user
from ...core.task_manager import task_manager, Task
from ..models.requests import BackupRequest, GenerateCollectionRequest
from ..models.responses import (
    MatchingReportResponse,
    MatchingReportItem,
    BackupResponse,
    GenerateCollectionResponse,
    TaskCreateResponse,
    TaskStatus,
)


router = APIRouter(prefix="/api/v1", tags=["reports"])
logger = logging.getLogger(__name__)


@router.get("/reports/matching", response_model=MatchingReportResponse)
async def get_matching_report(
    limit: int = 100,
    user: str = Depends(get_current_user),
):
    """Generate album matching report comparing service data."""
    db = get_database()

    try:
        import sqlite3
        with sqlite3.connect(db.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(f"""
                SELECT discogs_id, title, release_name_discogs, release_name_apple_music, release_name_spotify
                FROM releases
                WHERE discogs_id IS NOT NULL
                LIMIT {limit}
            """)
            rows = cursor.fetchall()

            items = []
            exact_matches = 0
            partial_matches = 0
            mismatches = 0
            missing = 0

            for row in rows:
                discogs_title = row["release_name_discogs"] or row["title"]
                apple_title = row["release_name_apple_music"]
                spotify_title = row["release_name_spotify"]

                # Determine match quality
                if not apple_title and not spotify_title:
                    match_quality = "missing"
                    missing += 1
                elif discogs_title == apple_title or discogs_title == spotify_title:
                    match_quality = "exact"
                    exact_matches += 1
                elif apple_title and spotify_title:
                    # Check for partial matches
                    discogs_lower = discogs_title.lower()
                    apple_lower = apple_title.lower() if apple_title else ""
                    spotify_lower = spotify_title.lower() if spotify_title else ""

                    if discogs_lower in apple_lower or apple_lower in discogs_lower or \
                       discogs_lower in spotify_lower or spotify_lower in discogs_lower:
                        match_quality = "partial"
                        partial_matches += 1
                    else:
                        match_quality = "mismatch"
                        mismatches += 1
                else:
                    match_quality = "partial"
                    partial_matches += 1

                items.append(
                    MatchingReportItem(
                        discogs_id=row["discogs_id"],
                        discogs_title=discogs_title,
                        apple_music_title=apple_title,
                        spotify_title=spotify_title,
                        match_quality=match_quality,
                    )
                )

            return MatchingReportResponse(
                items=items,
                total=len(items),
                exact_matches=exact_matches,
                partial_matches=partial_matches,
                mismatches=mismatches,
                missing=missing,
            )

    except Exception as e:
        logger.error(f"Failed to generate matching report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup", response_model=BackupResponse)
async def create_backup(
    request: BackupRequest,
    user: str = Depends(get_current_user),
):
    """Create a database backup."""
    db = get_database()

    try:
        from pathlib import Path

        # Ensure backup directory exists
        backup_folder = Path("backups")
        backup_folder.mkdir(exist_ok=True)

        # Generate backup path
        if request.backup_path:
            backup_path = Path(request.backup_path)
            if not backup_path.is_absolute():
                backup_path = backup_folder / backup_path
        else:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = backup_folder / f"collection_cache_backup_{timestamp}.db"

        success = db.backup_database(str(backup_path))

        if success:
            return BackupResponse(
                success=True,
                backup_path=str(backup_path),
                message=f"Database backed up successfully to {backup_path}",
            )
        else:
            return BackupResponse(
                success=False,
                message="Failed to backup database",
            )

    except Exception as e:
        logger.error(f"Backup failed: {e}")
        return BackupResponse(
            success=False,
            message=str(e),
        )


@router.post("/generate-collection", response_model=TaskCreateResponse)
async def generate_collection(
    request: GenerateCollectionRequest,
    user: str = Depends(get_current_user),
):
    """Generate collection.json file (creates a background task)."""
    task = await task_manager.create_task(
        task_type="generate_collection",
        params={
            "output_path": request.output_path,
            "data_path": request.data_path,
        },
    )

    return TaskCreateResponse(
        task_id=task.task_id,
        status=TaskStatus(task.status.value),
        message="Collection generation started",
    )


# Task handler for generating collection
async def handle_generate_collection(task: Task, manager):
    """Handle the generate_collection task."""
    await manager.update_progress(task.task_id, 10, "Starting collection generation")
    await manager.log_task(task.task_id, "info", "Starting collection.json generation")

    try:
        from music_collection_manager.utils.collection_generator import CollectionGenerator

        config = get_config()

        # Get paths
        data_path = task.params.get("data_path") or config.get("data.path", "data")
        output_path = task.params.get("output_path")

        await manager.update_progress(task.task_id, 30, "Initializing generator")

        # Initialize generator
        generator = CollectionGenerator(data_path, config.config, logger)

        await manager.update_progress(task.task_id, 50, "Generating collection.json")

        # Generate collection
        result_path = generator.generate_collection_json(output_path)

        await manager.update_progress(task.task_id, 90, "Reading results")

        # Count entries
        with open(result_path, 'r') as f:
            collection_data = json.load(f)
            total_entries = len(collection_data)

        await manager.update_progress(task.task_id, 100, "Completed")
        await manager.log_task(
            task.task_id, "info",
            f"Generated collection.json with {total_entries} entries at {result_path}"
        )

        task.result = {
            "output_path": str(result_path),
            "total_entries": total_entries,
        }

    except Exception as e:
        await manager.log_task(task.task_id, "error", str(e))
        raise


# Register the handler
task_manager.register_handler("generate_collection", handle_generate_collection)
