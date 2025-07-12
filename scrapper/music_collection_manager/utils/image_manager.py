"""Image management utilities for downloading and organizing album artwork."""

import requests
from pathlib import Path
from typing import Optional, Dict, List, Any
import logging

from .text_cleaner import TextCleaner, clean_for_filename
from .serializers import ReleaseSerializer


logger = logging.getLogger(__name__)


class ImageManager:
    """Manages downloading and organizing album artwork."""

    def __init__(self, base_path: str = "data/releases", config: Dict[str, Any] = None):
        """Initialize ImageManager with base path for storing images."""
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.config = config or {}

        # Image size configurations - now only download hi-res
        # Other sizes (medium, small, avatar) are generated at build time using Sharp
        if config and "image_sizes" in config:
            # Only use hi-res from config, ignore other sizes
            if "hi-res" in config["image_sizes"]:
                size_str = config["image_sizes"]["hi-res"]
                if "x" in size_str:
                    width_str = size_str.split("x")[0]
                    hi_res_size = int(width_str)
                else:
                    hi_res_size = int(size_str)
                self.image_sizes = {"hi-res": hi_res_size}
            else:
                self.image_sizes = {"hi-res": 2000}
        else:
            self.image_sizes = {"hi-res": 2000}

    def sanitize_filename(self, text: str) -> str:
        """Convert text to URL-safe filename."""
        return clean_for_filename(text)

    def create_release_folder(self, release_title: str, discogs_id: str) -> Path:
        """Create folder for release with URL-safe name."""
        sanitized_title = self.sanitize_filename(release_title)
        folder_name = f"{sanitized_title}-{discogs_id}"
        folder_path = self.base_path / folder_name
        folder_path.mkdir(exist_ok=True)
        return folder_path

    def get_artwork_url_with_size(self, artwork_url: str, size: int) -> str:
        """Modify Apple Music artwork URL for specific size."""
        if not artwork_url:
            return ""

        # Handle Apple Music URLs with placeholder format
        if "{w}x{h}" in artwork_url:
            return artwork_url.replace("{w}x{h}", f"{size}x{size}")
        elif "{w}" in artwork_url and "{h}" in artwork_url:
            return artwork_url.replace("{w}", str(size)).replace("{h}", str(size))

        # Handle Apple Music URLs that already have dimensions (e.g., 2000x2000bb.jpg)
        if "mzstatic.com" in artwork_url and artwork_url.endswith("bb.jpg"):
            # Replace existing dimensions with new size
            # Pattern: /nnnnxnnnnbb.jpg -> /sizexsizebb.jpg
            import re

            pattern = r"/\d+x\d+bb\.jpg$"
            replacement = f"/{size}x{size}bb.jpg"
            return re.sub(pattern, replacement, artwork_url)

        return artwork_url

    def download_image(
        self, url: str, file_path: Path, timeout: int = 30, user_agent: str = None
    ) -> bool:
        """Download image from URL to file path."""
        try:
            headers = {}
            if user_agent:
                headers["User-Agent"] = user_agent

            response = requests.get(url, timeout=timeout, stream=True, headers=headers)
            response.raise_for_status()

            with open(file_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            logger.info(f"Downloaded image: {file_path}")
            return True

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to download image from {url}: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error downloading image: {str(e)}")
            return False

    def download_album_artwork(
        self, release_title: str, discogs_id: str, artwork_url: str
    ) -> Dict[str, Optional[Path]]:
        """Download album artwork in multiple sizes."""
        if not artwork_url:
            logger.warning("No artwork URL provided")
            return {}

        # Create release folder
        release_folder = self.create_release_folder(release_title, discogs_id)

        # Download only hi-res image (other sizes generated at build time)
        downloaded_images = {}

        # Only download hi-res
        size_name = "hi-res"
        size_pixels = self.image_sizes[size_name]
        
        # Get size-specific URL
        sized_url = self.get_artwork_url_with_size(artwork_url, size_pixels)

        # Create filename with release name and ID
        sanitized_title = self.sanitize_filename(release_title)
        filename = f"{sanitized_title}-{discogs_id}-{size_name}.jpg"
        file_path = release_folder / filename

        # Download image
        if self.download_image(sized_url, file_path):
            downloaded_images[size_name] = file_path
            logger.info(f"Downloaded {size_name} artwork for {release_title} (other sizes will be generated at build time)")
        else:
            downloaded_images[size_name] = None
            logger.warning(f"Failed to download {size_name} artwork for {release_title}")

        return downloaded_images

    def download_album_artwork_with_fallback(
        self, release_title: str, discogs_id: str, image_sources: List[Dict[str, Any]]
    ) -> Dict[str, Optional[Path]]:
        """Download album artwork with fallback sources."""
        if not image_sources:
            logger.warning("No image sources provided")
            return {}

        # Create release folder
        release_folder = self.create_release_folder(release_title, discogs_id)

        # Download only hi-res image (other sizes generated at build time)
        downloaded_images = {}
        
        # Only download hi-res
        size_name = "hi-res"
        size_pixels = self.image_sizes[size_name]
        downloaded_images[size_name] = None

        # Try each image source in order
        for source in image_sources:
            source_type = source.get("type", "unknown")
            user_agent = source.get("user_agent")

            # Handle different URL types
            if source_type == "spotify":
                # Select best Spotify image for target size
                spotify_images = source.get("spotify_images", [])
                sized_url = self.select_best_spotify_image(
                    spotify_images, size_pixels
                )
                if not sized_url:
                    logger.warning(
                        f"No suitable Spotify image found for {size_name}"
                    )
                    continue

                # Find the actual size for logging
                for img in spotify_images:
                    if img.get("url") == sized_url:
                        spotify_size = (
                            f"{img.get('width', 0)}x{img.get('height', 0)}"
                        )
                        break
                else:
                    spotify_size = "unknown"
            else:
                # Get size-specific URL (for Apple Music mainly)
                url = source.get("url", "")
                if not url:
                    continue
                sized_url = self.get_artwork_url_with_size(url, size_pixels)

            # Create filename with release name and ID
            sanitized_title = self.sanitize_filename(release_title)
            filename = f"{sanitized_title}-{discogs_id}-{size_name}.jpg"
            file_path = release_folder / filename

            # Download image
            if self.download_image(sized_url, file_path, user_agent=user_agent):
                downloaded_images[size_name] = file_path
                if source_type == "spotify":
                    logger.info(
                        f"Downloaded {size_name} artwork for {release_title} from {source_type} ({spotify_size}) - other sizes will be generated at build time"
                    )
                else:
                    logger.info(
                        f"Downloaded {size_name} artwork for {release_title} from {source_type} - other sizes will be generated at build time"
                    )
                break  # Success, done
            else:
                logger.warning(
                    f"Failed to download {size_name} artwork from {source_type}"
                )

        if downloaded_images[size_name] is None:
            logger.warning(
                f"Failed to download {size_name} artwork for {release_title} from all sources"
            )

        return downloaded_images

    def extract_image_sources(self, release, preferred_source: Optional[str] = None) -> List[Dict[str, Any]]:
        """Extract image sources from release enrichment data in priority order."""
        all_sources = {}

        # Collect all available sources
        # Apple Music
        if hasattr(release, "raw_data") and "apple_music" in release.raw_data:
            apple_data = release.raw_data["apple_music"]
            if hasattr(apple_data, "artwork_url") and apple_data.artwork_url:
                all_sources["apple_music"] = {
                    "url": apple_data.artwork_url,
                    "type": "apple_music",
                    "user_agent": None,
                }

        # Spotify
        if hasattr(release, "raw_data") and "spotify" in release.raw_data:
            spotify_data = release.raw_data["spotify"]
            if hasattr(spotify_data, "images") and spotify_data.images:
                all_sources["spotify"] = {
                    "url": None,  # Will be selected based on target size
                    "type": "spotify",
                    "user_agent": None,
                    "spotify_images": spotify_data.images,
                }

        # Last.fm (Note: theaudiodb is not used for album artwork)
        if hasattr(release, "raw_data") and "lastfm" in release.raw_data:
            lastfm_data = release.raw_data["lastfm"]
            if hasattr(lastfm_data, "images") and lastfm_data.images:
                # Get the largest Last.fm image
                largest_image = None
                for img in lastfm_data.images:
                    if (
                        hasattr(img, "size")
                        and hasattr(img, "url")
                        and img.size in ["extralarge", "large", "medium"]
                        and img.url
                    ):
                        largest_image = img
                        break

                if largest_image:
                    all_sources["lastfm"] = {
                        "url": largest_image.url,
                        "type": "lastfm",
                        "user_agent": "Mozilla/5.0 (compatible; MusicCollectionManager/1.0)",
                    }

        # Discogs
        if hasattr(release, "raw_data") and "discogs" in release.raw_data:
            discogs_data = release.raw_data["discogs"]
            if hasattr(discogs_data, "images") and discogs_data.images:
                # Get the primary image
                primary_image = None
                for img in discogs_data.images:
                    if (
                        hasattr(img, "type")
                        and hasattr(img, "uri")
                        and img.type == "primary"
                        and img.uri
                    ):
                        primary_image = img
                        break

                if primary_image:
                    all_sources["discogs"] = {
                        "url": primary_image.uri,
                        "type": "discogs",
                        "user_agent": None,
                    }

        # Build the sources list based on preference
        sources = []
        
        # If a preferred source is specified and available, put it first
        if preferred_source and preferred_source in all_sources:
            sources.append(all_sources[preferred_source])
            logger.info(f"Using preferred image source: {preferred_source}")
        
        # Then add remaining sources in default priority order
        default_priority = ["apple_music", "spotify", "lastfm", "discogs"]
        
        for source_type in default_priority:
            if source_type in all_sources and (not preferred_source or source_type != preferred_source):
                sources.append(all_sources[source_type])

        return sources

    def select_best_spotify_image(
        self, spotify_images: List[Dict], target_size: int
    ) -> Optional[str]:
        """Select the best Spotify image URL for the target size."""
        if not spotify_images:
            return None

        # Find the image with size closest to but not smaller than target
        best_image = None
        best_diff = float("inf")

        for img in spotify_images:
            img_size = min(
                img.get("width", 0), img.get("height", 0)
            )  # Use smaller dimension
            if img_size >= target_size:  # Image is large enough
                diff = img_size - target_size
                if diff < best_diff:
                    best_diff = diff
                    best_image = img

        # If no image is large enough, use the largest available
        if best_image is None:
            best_image = max(
                spotify_images,
                key=lambda x: x.get("width", 0) * x.get("height", 0),
                default=None,
            )

        return best_image.get("url") if best_image else None

    def get_release_images(
        self, release_title: str, discogs_id: str
    ) -> Dict[str, Optional[Path]]:
        """Get paths to existing release images."""
        sanitized_title = self.sanitize_filename(release_title)
        folder_name = f"{sanitized_title}-{discogs_id}"
        release_folder = self.base_path / folder_name

        images = {}

        if release_folder.exists():
            # Check for hi-res image (the only one we download now)
            for size_name in self.image_sizes.keys():
                filename = f"{sanitized_title}-{discogs_id}-{size_name}.jpg"
                file_path = release_folder / filename
                images[size_name] = file_path if file_path.exists() else None
            
            # Also check for generated sizes (medium, avatar) if they exist
            # These would be generated at build time by the frontend
            for generated_size in ["medium", "avatar"]:
                filename = f"{sanitized_title}-{discogs_id}-{generated_size}.jpg"
                file_path = release_folder / filename
                images[generated_size] = file_path if file_path.exists() else None
        else:
            images = {size_name: None for size_name in self.image_sizes.keys()}
            # Also initialize generated sizes
            for generated_size in ["medium", "avatar"]:
                images[generated_size] = None

        return images

    def cleanup_failed_downloads(self, release_title: str, discogs_id: str) -> None:
        """Remove empty or corrupted image files."""
        sanitized_title = self.sanitize_filename(release_title)
        folder_name = f"{sanitized_title}-{discogs_id}"
        release_folder = self.base_path / folder_name

        if not release_folder.exists():
            return

        # Check hi-res images
        for size_name in self.image_sizes.keys():
            filename = f"{sanitized_title}-{discogs_id}-{size_name}.jpg"
            file_path = release_folder / filename

            if file_path.exists():
                try:
                    # Check if file is empty or very small (likely corrupted)
                    if file_path.stat().st_size < 1024:  # Less than 1KB
                        file_path.unlink()
                        logger.info(f"Removed corrupted image: {file_path}")
                except Exception as e:
                    logger.error(f"Error cleaning up image file {file_path}: {str(e)}")
        
        # Also check generated sizes
        for generated_size in ["medium", "avatar"]:
            filename = f"{sanitized_title}-{discogs_id}-{generated_size}.jpg"
            file_path = release_folder / filename

            if file_path.exists():
                try:
                    # Check if file is empty or very small (likely corrupted)
                    if file_path.stat().st_size < 1024:  # Less than 1KB
                        file_path.unlink()
                        logger.info(f"Removed corrupted generated image: {file_path}")
                except Exception as e:
                    logger.error(f"Error cleaning up generated image file {file_path}: {str(e)}")

        # Remove folder if empty
        try:
            if release_folder.exists() and not any(release_folder.iterdir()):
                release_folder.rmdir()
                logger.info(f"Removed empty release folder: {release_folder}")
        except Exception as e:
            logger.error(f"Error removing empty folder {release_folder}: {str(e)}")

    def save_release_json(
        self, release, release_title: str, discogs_id: str
    ) -> Optional[Path]:
        """Save release data as JSON in the release folder using centralized serializer."""
        release_folder = self.create_release_folder(release_title, discogs_id)
        sanitized_title = self.sanitize_filename(release_title)
        json_path = release_folder / f"{sanitized_title}-{discogs_id}.json"

        try:
            # Use centralized serializer for consistent JSON output
            json_content = ReleaseSerializer.to_json(release, include_enrichment=True)

            # Apply text cleaning to the JSON content
            json_content = TextCleaner.clean_for_json(json_content)

            with open(json_path, "w", encoding="utf-8") as f:
                f.write(json_content)

            logger.info(f"Saved release JSON: {json_path}")
            return json_path

        except Exception as e:
            logger.error(f"Failed to save release JSON: {str(e)}")
            return None

    def _json_serializer(self, obj: Any) -> str:
        """Custom JSON serializer for datetime and Path objects."""
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        elif isinstance(obj, Path):
            return str(obj)
        else:
            return str(obj)
