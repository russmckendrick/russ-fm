"""Dependency injection for the web application."""

import logging
from typing import Optional
from pathlib import Path
from functools import lru_cache

import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from music_collection_manager.config import ConfigManager
from music_collection_manager.utils.database import DatabaseManager
from music_collection_manager.utils.orchestrator import MusicDataOrchestrator
from music_collection_manager.utils.artist_orchestrator import ArtistDataOrchestrator


logger = logging.getLogger(__name__)


@lru_cache()
def get_config() -> ConfigManager:
    """Get the configuration manager (cached)."""
    config = ConfigManager()
    logger.info("Configuration loaded")
    return config


def get_database() -> DatabaseManager:
    """Get a database manager instance."""
    config = get_config()
    db_path = config.get("database.path", "collection_cache.db")
    return DatabaseManager(db_path, logger)


def get_orchestrator() -> MusicDataOrchestrator:
    """Get a music data orchestrator instance."""
    config = get_config()
    return MusicDataOrchestrator(config.config, logger)


def get_artist_orchestrator() -> ArtistDataOrchestrator:
    """Get an artist data orchestrator instance."""
    config = get_config()
    return ArtistDataOrchestrator(config.config, logger)


def get_logger() -> logging.Logger:
    """Get the application logger."""
    return logger


def check_database_exists() -> bool:
    """Check if the database file exists."""
    config = get_config()
    db_path = config.get("database.path", "collection_cache.db")
    return Path(db_path).exists()


def get_service_status() -> dict:
    """Get status of all configured services."""
    config = get_config()
    validation = config.validate_config()
    return validation
