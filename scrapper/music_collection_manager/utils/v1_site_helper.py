"""Helper module for fetching data from v1.russ.fm site."""

import json
import logging
import requests
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List


logger = logging.getLogger(__name__)


class V1SiteHelper:
    """Helper class for interacting with v1.russ.fm site."""
    
    CACHE_FILE = Path("v1_index_cache.json")
    CACHE_DURATION = timedelta(hours=24)  # Cache for 24 hours
    INDEX_URL = "https://v1.russ.fm/index.json"
    
    @classmethod
    def fetch_index(cls, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Fetch the v1 site index with caching."""
        # Check if we have a valid cache
        if not force_refresh and cls.CACHE_FILE.exists():
            try:
                with open(cls.CACHE_FILE, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                
                # Check if cache is still valid
                cached_time = datetime.fromisoformat(cache_data.get("cached_at", ""))
                if datetime.now() - cached_time < cls.CACHE_DURATION:
                    logger.info("Using cached v1 index")
                    return cache_data.get("index", [])
            except (json.JSONDecodeError, ValueError, KeyError) as e:
                logger.warning(f"Invalid cache file, will refetch: {e}")
        
        # Fetch fresh data
        logger.info("Fetching fresh v1 index from website")
        try:
            response = requests.get(cls.INDEX_URL, timeout=30)
            response.raise_for_status()
            
            raw_index_data = response.json()
            
            # Extract the documents array from the nested structure
            index_data = raw_index_data.get("documents", [])
            
            # Cache the data
            cache_data = {
                "cached_at": datetime.now().isoformat(),
                "index": index_data
            }
            
            try:
                with open(cls.CACHE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(cache_data, f, indent=2)
                logger.info(f"Cached v1 index with {len(index_data)} entries")
            except Exception as e:
                logger.warning(f"Failed to cache v1 index: {e}")
            
            return index_data
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch v1 index: {e}")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse v1 index: {e}")
            raise
    
    @classmethod
    def find_release_by_discogs_id(cls, discogs_id: str, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """Find a release by Discogs ID in the v1 index."""
        try:
            index_data = cls.fetch_index(force_refresh)
            
            # Debug: log the structure of the first entry
            if index_data and len(index_data) > 0:
                logger.debug(f"First entry type: {type(index_data[0])}")
                if isinstance(index_data[0], dict):
                    logger.debug(f"First entry keys: {list(index_data[0].keys())[:5]}")
            
            for entry in index_data:
                # Ensure entry is a dict before using .get()
                if isinstance(entry, dict) and entry.get("discogsRelease") == discogs_id:
                    return entry
            
            return None
            
        except Exception as e:
            logger.error(f"Error searching for release {discogs_id}: {e}")
            return None
    
    @classmethod
    def find_artist_images(cls, artist_name: str, force_refresh: bool = False) -> Dict[str, str]:
        """Find all unique artist images for a given artist name."""
        try:
            index_data = cls.fetch_index(force_refresh)
            
            # Collect unique artist images (case-insensitive search)
            artist_images = {}
            artist_name_lower = artist_name.lower()
            
            for entry in index_data:
                # Ensure entry is a dict before using .get()
                if isinstance(entry, dict):
                    entry_artist = entry.get("artist")
                    # Handle None/null values and ensure we have a string
                    if entry_artist and isinstance(entry_artist, str) and entry_artist.lower() == artist_name_lower and entry.get("artistImage"):
                        # Use the exact artist name from the entry as key
                        artist_images[entry_artist] = entry["artistImage"]
            
            return artist_images
            
        except Exception as e:
            logger.error(f"Error searching for artist {artist_name}: {e}")
            return {}
    
    @classmethod
    def clear_cache(cls):
        """Clear the cached index file."""
        if cls.CACHE_FILE.exists():
            try:
                cls.CACHE_FILE.unlink()
                logger.info("Cleared v1 index cache")
            except Exception as e:
                logger.error(f"Failed to clear cache: {e}")