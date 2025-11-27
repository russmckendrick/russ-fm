"""Utility for updating album JSON files in the public directory."""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional


class JsonUpdater:
    """Updates album JSON files in the public directory."""

    def __init__(
        self,
        public_path: str = "../public",
        logger: Optional[logging.Logger] = None
    ):
        """
        Initialize the JSON updater.

        Args:
            public_path: Path to the public directory (relative to scrapper or absolute)
            logger: Optional logger instance
        """
        self.logger = logger or logging.getLogger(__name__)

        # Handle relative path from scrapper directory
        if not Path(public_path).is_absolute():
            # Assume we're running from the scrapper directory
            scrapper_dir = Path(__file__).parent.parent.parent
            self.public_path = scrapper_dir.parent / "public"
        else:
            self.public_path = Path(public_path)

        self.logger.debug(f"JsonUpdater initialized with public path: {self.public_path}")

    def _get_album_slug(self, title: str, artists: list) -> str:
        """
        Generate album slug from title and artists.

        Args:
            title: Album title
            artists: List of artist names

        Returns:
            URL-safe slug
        """
        import re

        # Combine artist and title
        if artists:
            combined = f"{artists[0]} {title}"
        else:
            combined = title

        # Convert to lowercase and replace spaces/special chars with hyphens
        slug = combined.lower()
        slug = re.sub(r'[^\w\s-]', '', slug)  # Remove special characters
        slug = re.sub(r'[-\s]+', '-', slug)   # Replace spaces and multiple hyphens
        slug = slug.strip('-')                 # Remove leading/trailing hyphens

        return slug

    def find_album_json(self, discogs_id: str, title: str, artists: list) -> Optional[Path]:
        """
        Find the album JSON file path.

        Args:
            discogs_id: Discogs release ID
            title: Album title
            artists: List of artist names

        Returns:
            Path to the JSON file if found, None otherwise
        """
        album_dir = self.public_path / "album"

        if not album_dir.exists():
            self.logger.warning(f"Album directory not found: {album_dir}")
            return None

        # Try to find by slug
        slug = self._get_album_slug(title, artists)
        potential_path = album_dir / slug / f"{slug}.json"

        if potential_path.exists():
            return potential_path

        # Search through all album directories for matching Discogs ID
        for album_folder in album_dir.iterdir():
            if album_folder.is_dir():
                json_files = list(album_folder.glob("*.json"))
                for json_file in json_files:
                    try:
                        with open(json_file, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            if str(data.get("discogs_id")) == str(discogs_id):
                                return json_file
                    except (json.JSONDecodeError, IOError):
                        continue

        self.logger.warning(f"Album JSON not found for: {title} by {artists}")
        return None

    def update_album_perplexity_description(
        self,
        discogs_id: str,
        title: str,
        artists: list,
        description_data: Dict[str, Any]
    ) -> bool:
        """
        Update the Perplexity description in an album's JSON file.

        Args:
            discogs_id: Discogs release ID
            title: Album title
            artists: List of artist names
            description_data: Dictionary containing description and metadata

        Returns:
            True if update was successful, False otherwise
        """
        json_path = self.find_album_json(discogs_id, title, artists)

        if not json_path:
            self.logger.warning(f"Cannot update JSON: file not found for {title}")
            return False

        try:
            # Read existing data
            with open(json_path, 'r', encoding='utf-8') as f:
                album_data = json.load(f)

            # Ensure services structure exists
            if "services" not in album_data:
                album_data["services"] = {}

            # Update perplexity data
            album_data["services"]["perplexity"] = description_data

            # Write back to file
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(album_data, f, indent=2, ensure_ascii=False)

            self.logger.info(f"Updated Perplexity description in: {json_path}")
            return True

        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse JSON file {json_path}: {str(e)}")
            return False
        except IOError as e:
            self.logger.error(f"Failed to read/write JSON file {json_path}: {str(e)}")
            return False
        except Exception as e:
            self.logger.error(f"Unexpected error updating JSON file: {str(e)}")
            return False

    def check_album_has_description(
        self,
        discogs_id: str,
        title: str,
        artists: list
    ) -> Dict[str, bool]:
        """
        Check if an album has descriptions from various sources.

        Args:
            discogs_id: Discogs release ID
            title: Album title
            artists: List of artist names

        Returns:
            Dictionary with source names as keys and boolean values
        """
        json_path = self.find_album_json(discogs_id, title, artists)

        result = {
            "apple_music": False,
            "lastfm": False,
            "perplexity": False,
            "file_found": False
        }

        if not json_path:
            return result

        result["file_found"] = True

        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                album_data = json.load(f)

            services = album_data.get("services", {})

            # Check Apple Music
            apple_music = services.get("apple_music", {})
            result["apple_music"] = bool(
                apple_music.get("raw_attributes", {}).get("editorialNotes")
                or apple_music.get("editorial_notes")
            )

            # Check Last.fm
            lastfm = services.get("lastfm", {})
            result["lastfm"] = bool(
                lastfm.get("wiki_summary")
                or lastfm.get("wiki_content")
            )

            # Check Perplexity
            perplexity = services.get("perplexity", {})
            result["perplexity"] = bool(perplexity.get("description"))

        except (json.JSONDecodeError, IOError) as e:
            self.logger.error(f"Error reading JSON file: {str(e)}")

        return result
