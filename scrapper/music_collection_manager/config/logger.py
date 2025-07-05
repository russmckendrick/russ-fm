"""Logging configuration for the music collection manager."""

import logging
import logging.handlers
from typing import Optional
from pathlib import Path
from datetime import datetime


def setup_logging(
    level: str = "INFO",
    log_file: Optional[str] = None,
    log_format: Optional[str] = None,
    session_based: bool = True
) -> logging.Logger:
    """Set up logging configuration."""
    
    # Set up root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    
    # Clear existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Default format
    if not log_format:
        log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    formatter = logging.Formatter(log_format)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(getattr(logging, level.upper()))
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # File handler if log_file is specified
    if log_file:
        log_path = Path(log_file)
        
        # Create session-based log filename if enabled
        if session_based:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            log_stem = log_path.stem
            log_suffix = log_path.suffix
            session_log_name = f"{log_stem}_{timestamp}{log_suffix}"
            session_log_path = log_path.parent / session_log_name
        else:
            session_log_path = log_path
        
        session_log_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_handler = logging.FileHandler(session_log_path)
        file_handler.setLevel(getattr(logging, level.upper()))
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)
        
        # Log the session start
        logging.info(f"Session started - Log file: {session_log_path}")
    
    # Set up specific loggers
    setup_service_loggers()
    
    return root_logger


def setup_service_loggers():
    """Set up specific loggers for services."""
    
    # Reduce noise from third-party libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
    
    # Set up service-specific loggers
    service_loggers = [
        "music_collection_manager.services.discogs",
        "music_collection_manager.services.apple_music",
        "music_collection_manager.services.spotify",
        "music_collection_manager.services.wikipedia",
        "music_collection_manager.services.lastfm",
        "music_collection_manager.utils.orchestrator",
        "music_collection_manager.utils.database",
    ]
    
    for logger_name in service_loggers:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.INFO)


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance."""
    return logging.getLogger(name)