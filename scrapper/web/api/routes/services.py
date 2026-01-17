"""Service status and testing API routes."""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from ...dependencies import get_config, get_database, get_orchestrator, check_database_exists
from ...core.auth import get_current_user
from ..models.responses import StatusResponse, ServiceStatus, ErrorResponse


router = APIRouter(prefix="/api/v1", tags=["services"])
logger = logging.getLogger(__name__)


@router.get("/status", response_model=StatusResponse)
async def get_status(user: str = Depends(get_current_user)):
    """Get overall system status."""
    config = get_config()
    db_exists = check_database_exists()

    response = StatusResponse(
        database_exists=db_exists,
        database_path=config.get("database.path", "collection_cache.db"),
    )

    if db_exists:
        db = get_database()
        stats = db.get_stats()
        response.total_releases = stats.get("total_releases", 0)
        response.total_collection_items = stats.get("total_collection_items", 0)
        response.processed_items = stats.get("processed_items", 0)
        response.enriched_items = stats.get("enriched_items", 0)

        # Count artists (simple query)
        try:
            import sqlite3
            with sqlite3.connect(db.db_path) as conn:
                cursor = conn.execute("SELECT COUNT(*) FROM artists")
                response.total_artists = cursor.fetchone()[0]
        except Exception:
            response.total_artists = 0

    # Get service configuration status
    validation = config.validate_config()
    services = []
    for service_name, configured in validation.items():
        services.append(
            ServiceStatus(
                name=service_name,
                configured=configured,
                connected=False,  # Will be set by test endpoint
            )
        )
    response.services = services

    return response


@router.get("/services", response_model=List[ServiceStatus])
async def list_services(user: str = Depends(get_current_user)):
    """List all services with configuration status."""
    config = get_config()
    validation = config.validate_config()

    services = []
    for service_name, configured in validation.items():
        services.append(
            ServiceStatus(
                name=service_name,
                configured=configured,
                connected=False,
            )
        )

    return services


@router.post("/services/test", response_model=List[ServiceStatus])
async def test_services(user: str = Depends(get_current_user)):
    """Test connections to all configured services."""
    try:
        orchestrator = get_orchestrator()
        test_results = orchestrator.test_services()

        config = get_config()
        validation = config.validate_config()

        services = []
        for service_name, configured in validation.items():
            connected = test_results.get(service_name, False) if configured else False
            error = None if connected or not configured else "Connection failed"

            services.append(
                ServiceStatus(
                    name=service_name,
                    configured=configured,
                    connected=connected,
                    error=error,
                )
            )

        return services

    except Exception as e:
        logger.error(f"Service test failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
