"""Collection.json generator for React app integration."""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from urllib.parse import quote

from .database import DatabaseManager


class CollectionGenerator:
    """Generates collection.json file for React app integration."""
    
    def __init__(self, data_path: str = "data", config: Dict[str, Any] = None, logger: Optional[logging.Logger] = None):
        self.data_path = Path(data_path)
        self.config = config or {}
        self.logger = logger or logging.getLogger(__name__)
        
        # Get configurable paths
        self.releases_path = self.config.get("releases", {}).get("path", "album")
        self.artists_path = self.config.get("artists", {}).get("path", "artist")
        
        # Initialize database manager
        db_path = self.config.get("database", {}).get("path", "collection_cache.db")
        self.db_manager = DatabaseManager(db_path, logger)
        
    def generate_collection_json(self, output_path: Optional[str] = None) -> Path:
        """Generate collection.json file from database releases."""
        if output_path is None:
            output_path = self.data_path / "collection.json"
        else:
            output_path = Path(output_path)
            
        self.logger.info(f"Generating collection.json at: {output_path}")
        
        # Get all releases from database
        releases = self.db_manager.get_all_releases()
        
        self.logger.info(f"Found {len(releases)} releases to include in collection.json")
        
        # Generate collection entries
        collection_entries = []
        
        for release in releases:
            try:
                entry = self._create_collection_entry_from_release(release)
                if entry:
                    collection_entries.append(entry)
            except Exception as e:
                self.logger.warning(f"Failed to create collection entry for {release.title}: {str(e)}")
                
        # Sort by date_added (newest first)
        collection_entries.sort(key=lambda x: x.get('date_added', '1900-01-01'), reverse=True)
        
        # Write collection.json
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(collection_entries, f, indent=2, ensure_ascii=False)
            
        self.logger.info(f"Generated collection.json with {len(collection_entries)} entries")
        return output_path
    
    def _create_collection_entry_from_release(self, release) -> Optional[Dict[str, Any]]:
        """Create a collection entry from a Release object."""
        # Extract basic info
        release_name = self._get_release_name_from_object(release)
        release_artist = self._get_release_artist_from_object(release)
        
        if not release_name or not release_artist:
            self.logger.warning(f"Missing release name or artist for {release.discogs_id}")
            return None
            
        # Create URIs
        release_folder = self._sanitize_filename(f"{release_name}-{release.discogs_id}")
        artist_folder = self._sanitize_filename(release_artist)
        
        # Get genre names
        genre_names = self._get_genre_names_from_object(release)
        
        # Get dates
        date_added = self._get_date_added_from_object(release)
        date_release_year = self._get_release_year_from_object(release)
        
        # Create entry
        entry = {
            "release_name": release_name,
            "release_artist": release_artist,
            "genre_names": genre_names,
            "uri_release": f"/{self.releases_path}/{release_folder}/",
            "uri_artist": f"/{self.artists_path}/{artist_folder}/",
            "date_added": date_added or "1900-01-01",
            "date_release_year": date_release_year or "1900-01-01",
            "json_detailed_release": f"/{self.releases_path}/{release_folder}/{release_folder}.json",
            "json_detailed_artist": f"/{self.artists_path}/{artist_folder}/{artist_folder}.json",
            "images_uri_release": self._get_release_image_uris_from_object(release, release_folder),
            "images_uri_artist": self._get_artist_image_uris_from_object(release_artist, artist_folder)
        }
        
        return entry
    
    def _get_release_name_from_object(self, release) -> Optional[str]:
        """Extract release name from Release object - using ONLY Discogs release name."""
        # Use ONLY the Discogs release name for consistency
        if hasattr(release, 'release_name_discogs') and release.release_name_discogs:
            return release.release_name_discogs
            
        # Fall back to main title if no Discogs name available
        if hasattr(release, 'title') and release.title:
            return release.title
                
        return None
    
    def _get_release_artist_from_object(self, release) -> Optional[str]:
        """Extract main artist name from Release object."""
        # Try artists array first
        if hasattr(release, 'artists') and release.artists:
            first_artist = release.artists[0]
            if hasattr(first_artist, 'name') and first_artist.name:
                return first_artist.name
                
        return None
    
    def _get_genre_names_from_object(self, release) -> List[str]:
        """Extract genre names from Release object."""
        if hasattr(release, 'genres') and release.genres:
            return release.genres
            
        return []
    
    def _get_date_added_from_object(self, release) -> Optional[str]:
        """Extract date added from Release object."""
        if hasattr(release, 'date_added') and release.date_added:
            try:
                # Convert to YYYY-MM-DD format
                date_str = release.date_added.strftime('%Y-%m-%d')
                return date_str
            except:
                return None
        return None
    
    def _get_release_year_from_object(self, release) -> Optional[str]:
        """Extract release year from Release object."""
        # Priority 1: Try to load Apple Music releaseDate from JSON file
        try:
            if hasattr(release, 'discogs_id') and release.discogs_id:
                release_folder = self._sanitize_filename(f"{self._get_release_name_from_object(release)}-{release.discogs_id}")
                json_path = self.data_path / self.releases_path / release_folder / f"{release_folder}.json"
                
                if json_path.exists():
                    import json
                    with open(json_path, 'r', encoding='utf-8') as f:
                        release_data = json.load(f)
                    
                    # Check Apple Music releaseDate
                    services = release_data.get('services', {})
                    apple_music = services.get('apple_music', {})
                    raw_attributes = apple_music.get('raw_attributes', {})
                    release_date = raw_attributes.get('releaseDate')
                    if release_date:
                        return release_date
                    
                    # Check Spotify release_date as fallback
                    spotify = services.get('spotify', {})
                    release_date = spotify.get('release_date')
                    if release_date:
                        return release_date
        except:
            pass
        
        # Priority 3: Year field fallback
        if hasattr(release, 'year') and release.year:
            try:
                return f"{release.year}-01-01"
            except:
                pass
                
        # Priority 4: Released field fallback
        if hasattr(release, 'released') and release.released:
            try:
                # Extract year and format as YYYY-01-01
                if len(release.released) >= 4:
                    year = release.released[:4]
                    return f"{year}-01-01"
            except:
                pass
                
        return None
    
    def _get_release_image_uris_from_object(self, release, release_folder: str) -> Dict[str, str]:
        """Get release image URIs from Release object."""
        # Check if we have local images
        if hasattr(release, 'local_images') and release.local_images:
            image_uris = {}
            for size in ["hi-res", "medium", "small"]:
                if size in release.local_images and release.local_images[size]:
                    # Convert absolute path to relative URI
                    image_path = Path(release.local_images[size])
                    if image_path.exists():
                        # Extract relative path from data_path
                        try:
                            relative_path = image_path.relative_to(self.data_path)
                            image_uris[size] = f"/{relative_path}"
                        except ValueError:
                            # If path is not relative to data_path, use default structure
                            image_uris[size] = f"/{self.releases_path}/{release_folder}/{release_folder}-{size}.jpg"
                    else:
                        # Use default path structure
                        image_uris[size] = f"/{self.releases_path}/{release_folder}/{release_folder}-{size}.jpg"
                else:
                    # Use default path structure
                    image_uris[size] = f"/{self.releases_path}/{release_folder}/{release_folder}-{size}.jpg"
            return image_uris
        else:
            # Use default path structure
            image_uris = {}
            for size in ["hi-res", "medium", "small"]:
                image_uris[size] = f"/{self.releases_path}/{release_folder}/{release_folder}-{size}.jpg"
            return image_uris
    
    def _get_artist_image_uris_from_object(self, artist_name: str, artist_folder: str) -> Dict[str, str]:
        """Get artist image URIs."""
        # Check if artist folder exists
        artist_path = self.data_path / self.artists_path / artist_folder
        
        image_uris = {}
        for size in ["hi-res", "medium", "small"]:
            image_uris[size] = f"/{self.artists_path}/{artist_folder}/{artist_folder}-{size}.jpg"
            
        return image_uris
    
    def _sanitize_filename(self, name: str) -> str:
        """Sanitize filename to match existing artist folder structure."""
        # Convert to lowercase and replace spaces with dashes
        sanitized = name.lower().replace(" ", "-")
        
        # Remove special characters except dashes
        sanitized = "".join(c for c in sanitized if c.isalnum() or c in "-")
        
        # Remove multiple consecutive dashes
        while "--" in sanitized:
            sanitized = sanitized.replace("--", "-")
            
        # Remove leading/trailing dashes
        sanitized = sanitized.strip("-")
        
        return sanitized
    
    def _validate_entry_files(self, entry: Dict[str, Any]) -> bool:
        """Validate that all referenced files exist."""
        # Check release JSON file
        release_json_path = self.data_path / entry["json_detailed_release"].lstrip("/")
        if not release_json_path.exists():
            self.logger.debug(f"Missing release JSON: {release_json_path}")
            return False
            
        # Check artist JSON file
        artist_json_path = self.data_path / entry["json_detailed_artist"].lstrip("/")
        if not artist_json_path.exists():
            self.logger.debug(f"Missing artist JSON: {artist_json_path}")
            # Artist JSON is not critical, just log but don't fail
            
        # Check release images (at least one size should exist)
        release_images_exist = False
        for size, uri in entry["images_uri_release"].items():
            image_path = self.data_path / uri.lstrip("/")
            if image_path.exists():
                release_images_exist = True
                break
                
        if not release_images_exist:
            self.logger.debug(f"No release images found for: {entry['release_name']}")
            # Images are not critical, just log but don't fail
            
        # Check artist images (at least one size should exist)  
        artist_images_exist = False
        for size, uri in entry["images_uri_artist"].items():
            image_path = self.data_path / uri.lstrip("/")
            if image_path.exists():
                artist_images_exist = True
                break
                
        if not artist_images_exist:
            self.logger.debug(f"No artist images found for: {entry['release_artist']}")
            # Images are not critical, just log but don't fail
            
        # Only require the release JSON to exist
        return True