"""Artist data orchestrator for coordinating API calls."""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from pathlib import Path

from ..models import Artist, Image
from ..models.enrichment import ArtistAppleMusicData, ArtistSpotifyData, ArtistLastFmData
from ..services.discogs import DiscogsService
from ..services.apple_music import AppleMusicService
from ..services.spotify import SpotifyService
from ..services.lastfm import LastFmService
from ..services.wikipedia import WikipediaService
from .image_manager import ImageManager
from .database import DatabaseManager
from .serializers import ArtistSerializer


class ArtistDataOrchestrator:
    """Orchestrates artist data collection from multiple music services."""
    
    def __init__(self, config: Dict[str, Any], logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger(__name__)
        self.services = {}
        self.interactive_mode = False
        
        # Initialize image manager for artists with configurable path
        data_path = config.get("data", {}).get("path", "data")
        artists_folder = config.get("artists", {}).get("path", "artists")
        artists_path = f"{data_path}/{artists_folder}"
        self.image_manager = ArtistImageManager(artists_path, config)
        
        # Initialize database manager
        db_path = config.get("database", {}).get("path", "collection_cache.db")
        self.db_manager = DatabaseManager(db_path, logger)
        
        # Initialize services
        self._initialize_services()
    
    def _initialize_services(self):
        """Initialize all available services."""
        service_configs = {
            "discogs": self.config.get("discogs", {}),
            "apple_music": self.config.get("apple_music", {}),
            "spotify": self.config.get("spotify", {}),
            "wikipedia": self.config.get("wikipedia", {}),
            "lastfm": self.config.get("lastfm", {}),
        }
        
        # Initialize Discogs service
        if service_configs["discogs"].get("access_token"):
            try:
                self.services["discogs"] = DiscogsService(service_configs["discogs"], logger=self.logger)
                self.logger.info("Discogs service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize Discogs service: {str(e)}")
        
        # Initialize Apple Music service
        try:
            self.services["apple_music"] = AppleMusicService(service_configs["apple_music"], logger=self.logger)
            self.logger.info("Apple Music service initialized")
        except Exception as e:
            self.logger.warning(f"Failed to initialize Apple Music service: {str(e)}")
        
        # Initialize Spotify service
        try:
            self.services["spotify"] = SpotifyService(service_configs["spotify"], logger=self.logger)
            self.logger.info("Spotify service initialized")
        except Exception as e:
            self.logger.warning(f"Failed to initialize Spotify service: {str(e)}")
        
        # Initialize Wikipedia service
        try:
            self.services["wikipedia"] = WikipediaService(service_configs["wikipedia"], logger=self.logger)
            self.logger.info("Wikipedia service initialized")
        except Exception as e:
            self.logger.warning(f"Failed to initialize Wikipedia service: {str(e)}")
        
        # Initialize Last.fm service
        try:
            self.services["lastfm"] = LastFmService(service_configs["lastfm"], logger=self.logger)
            self.logger.info("Last.fm service initialized")
        except Exception as e:
            self.logger.warning(f"Failed to initialize Last.fm service: {str(e)}")
    
    def set_interactive_mode(self, enabled: bool):
        """Enable or disable interactive mode for manual artist match selection."""
        self.interactive_mode = enabled
        self.logger.info(f"Artist interactive mode: {'enabled' if enabled else 'disabled'}")
    
    def get_artist_by_name(self, artist_name: str, force_refresh: bool = False, existing_artist: Optional[Artist] = None) -> Optional[Artist]:
        """Get comprehensive artist information by name."""
        # Check database first if not forcing refresh
        if not force_refresh:
            cached_artist = self.db_manager.get_artist_by_name(artist_name)
            if cached_artist and self.db_manager.has_enriched_artist(artist_name):
                self.logger.info(f"Using cached data for artist: {artist_name}")
                return cached_artist
        
        # Use existing artist if provided (with Discogs ID), otherwise create new
        if existing_artist:
            artist = existing_artist
        else:
            artist = Artist(name=artist_name)
        
        # Enrich with data from all services
        artist = self.enrich_artist(artist)
        
        # Save to database
        if self.db_manager.save_artist(artist):
            self.logger.info(f"Saved artist {artist_name} to database")
        
        return artist
    
    def enrich_artist(self, artist: Artist) -> Artist:
        """Enrich an artist with data from all available services."""
        artist_name = artist.name
        
        # Generate Discogs URL if we have the ID but no URL
        if artist.discogs_id and not artist.discogs_url:
            artist.discogs_url = f"https://www.discogs.com/artist/{artist.discogs_id}"
        
        # Enrich with Apple Music (skip image download)
        if "apple_music" in self.services:
            apple_data = self._get_apple_music_artist_data(artist_name)
            if apple_data:
                artist.raw_data["apple_music"] = apple_data
                
                if apple_data.id:
                    artist.apple_music_id = apple_data.id
                if apple_data.url:
                    artist.apple_music_url = apple_data.url
                if apple_data.genres:
                    for genre in apple_data.genres:
                        if genre not in artist.genres:
                            artist.genres.append(genre)
                
                # Add Apple Music image to metadata but don't download
                if apple_data.artwork_url:
                    apple_image = Image(
                        url=apple_data.artwork_url,
                        type="apple_music_artist",
                        width=2000,
                        height=2000
                    )
                    artist.add_image(apple_image)
        
        # Enrich with Spotify
        if "spotify" in self.services:
            spotify_data = self._get_spotify_artist_data(artist_name)
            if spotify_data:
                artist.raw_data["spotify"] = spotify_data
                
                if spotify_data.id:
                    artist.spotify_id = spotify_data.id
                if spotify_data.url:
                    artist.spotify_url = spotify_data.url
                if spotify_data.popularity:
                    artist.popularity = spotify_data.popularity
                if spotify_data.followers:
                    artist.followers = spotify_data.followers
                if spotify_data.genres:
                    for genre in spotify_data.genres:
                        if genre not in artist.genres:
                            artist.genres.append(genre)
                
                # Add Spotify images
                for img_data in spotify_data.images:
                    if isinstance(img_data, dict):
                        spotify_image = Image(
                            url=img_data.get("url", ""),
                            type="spotify_artist",
                            width=img_data.get("width"),
                            height=img_data.get("height")
                        )
                        artist.add_image(spotify_image)
        
        # Enrich with Last.fm
        if "lastfm" in self.services:
            lastfm_data = self._get_lastfm_artist_data(artist_name)
            if lastfm_data:
                artist.raw_data["lastfm"] = lastfm_data
                
                if lastfm_data.mbid:
                    artist.lastfm_mbid = lastfm_data.mbid
                if lastfm_data.url:
                    artist.lastfm_url = lastfm_data.url
                if lastfm_data.bio_content and not artist.biography:
                    artist.biography = lastfm_data.bio_content
                if lastfm_data.tags:
                    for tag in lastfm_data.tags[:5]:  # Limit to top 5 tags
                        if tag not in artist.genres:
                            artist.genres.append(tag)
                
                # Add Last.fm images
                for img_data in lastfm_data.images:
                    if isinstance(img_data, dict) and img_data.get("url"):
                        lastfm_image = Image(
                            url=img_data.get("url", ""),
                            type=f"lastfm_artist_{img_data.get('size', 'unknown')}"
                        )
                        artist.add_image(lastfm_image)
        
        # Enrich with Wikipedia
        if "wikipedia" in self.services and not artist.biography:
            wiki_data = self._get_wikipedia_artist_data(artist_name)
            if wiki_data:
                if isinstance(wiki_data, dict):
                    if wiki_data.get("extract"):
                        artist.biography = wiki_data["extract"]
                    if wiki_data.get("url"):
                        artist.wikipedia_url = wiki_data["url"]
                elif hasattr(wiki_data, "extract"):
                    artist.biography = wiki_data.extract
                    artist.wikipedia_url = wiki_data.url
        
        # Download artist images with new priority logic
        self._download_artist_images(artist)
        
        artist.updated_at = datetime.now()
        
        # Save comprehensive JSON data to artists folder
        try:
            self.image_manager.save_artist_json(artist)
        except Exception as e:
            self.logger.warning(f"Failed to save artist JSON: {str(e)}")
        
        return artist
    
    def _get_apple_music_artist_data(self, artist_name: str) -> Optional[ArtistAppleMusicData]:
        """Get Apple Music data for an artist."""
        try:
            service = self.services["apple_music"]
            search_results = service.search_artist(artist_name)
            
            if self.interactive_mode:
                selected_match = self._interactive_select_artist_match("Apple Music", search_results, artist_name)
                if selected_match:
                    return service.create_artist_enrichment(selected_match)
            else:
                best_match = service.find_best_artist_match(search_results, artist_name)
                if best_match:
                    return service.create_artist_enrichment(best_match)
            
        except Exception as e:
            self.logger.warning(f"Failed to get Apple Music artist data for {artist_name}: {str(e)}")
        
        return None
    
    def _get_spotify_artist_data(self, artist_name: str) -> Optional[ArtistSpotifyData]:
        """Get Spotify data for an artist."""
        try:
            service = self.services["spotify"]
            search_results = service.search_artist(artist_name)
            
            if self.interactive_mode:
                selected_match = self._interactive_select_artist_match("Spotify", search_results, artist_name)
                if selected_match:
                    return service.create_artist_enrichment(selected_match)
            else:
                best_match = service.find_best_artist_match(search_results, artist_name)
                if best_match:
                    return service.create_artist_enrichment(best_match)
            
        except Exception as e:
            self.logger.warning(f"Failed to get Spotify artist data for {artist_name}: {str(e)}")
        
        return None
    
    def _get_lastfm_artist_data(self, artist_name: str) -> Optional[ArtistLastFmData]:
        """Get Last.fm data for an artist."""
        try:
            service = self.services["lastfm"]
            return service.get_artist_detailed_info(artist_name)
            
        except Exception as e:
            self.logger.warning(f"Failed to get Last.fm artist data for {artist_name}: {str(e)}")
        
        return None
    
    def _get_wikipedia_artist_data(self, artist_name: str) -> Optional[Any]:
        """Get Wikipedia data for an artist."""
        try:
            service = self.services["wikipedia"]
            return service.search_artist(artist_name)
            
        except Exception as e:
            self.logger.warning(f"Failed to get Wikipedia artist data for {artist_name}: {str(e)}")
        
        return None
    
    def _download_artist_images(self, artist: Artist) -> None:
        """Download artist images with priority: Apple Music (no /Music[digits]/) > Spotify > Discogs."""
        try:
            self.logger.info(f"🖼️ Starting image download process for artist: {artist.name}")
            
            # Extract image sources in priority order: Apple Music (no /Music[digits]/) > Spotify > Discogs
            image_sources = self._extract_artist_image_sources(artist)
            
            if not image_sources:
                self.logger.info(f"🖼️ ❌ No image sources found for artist: {artist.name}")
                return
            
            self.logger.info(f"🖼️ ✅ Found {len(image_sources)} image sources, attempting download...")
            
            # Download artist images using the sources
            downloaded_images = self.image_manager.download_artist_images_with_fallback(
                artist.name,
                image_sources
            )
            
            if downloaded_images:
                self.logger.info(f"🖼️ ✅ Successfully downloaded artist images for {artist.name}: {list(downloaded_images.keys())}")
                artist.local_images = downloaded_images
            else:
                self.logger.warning(f"🖼️ ❌ Failed to download any artist images for {artist.name}")
                
        except Exception as e:
            self.logger.warning(f"🖼️ ❌ Failed to download artist images for {artist.name}: {str(e)}")
    
    def _extract_artist_image_sources(self, artist: Artist) -> List[Dict[str, Any]]:
        """Extract artist image sources in priority order: Apple Music (no /Music[digits]/) > Spotify > Discogs."""
        sources = []
        
        self.logger.info(f"🔍 Extracting image sources for artist: {artist.name}")
        self.logger.info(f"📊 Available raw_data keys: {list(artist.raw_data.keys())}")
        
        # Priority 1: Apple Music (but skip URLs with /Music[digits]/ pattern)
        if "apple_music" in artist.raw_data:
            apple_data = artist.raw_data["apple_music"]
            self.logger.info(f"🍎 Apple Music data found. Type: {type(apple_data)}")
            
            # Handle both object attributes and dictionary keys
            artwork_url = None
            if hasattr(apple_data, "artwork_url"):
                # Object with attributes
                artwork_url = apple_data.artwork_url
                self.logger.info(f"🍎 Found artwork_url as object attribute")
            elif isinstance(apple_data, dict) and "artwork_url" in apple_data:
                # Dictionary with keys
                artwork_url = apple_data["artwork_url"]
                self.logger.info(f"🍎 Found artwork_url as dictionary key")
            
            self.logger.info(f"🍎 Apple Music artwork_url: {artwork_url}")
            
            if artwork_url:
                # Filter out images with /Music[digits]/ pattern in the URL
                import re
                
                # Skip images with /Music[digits]/ pattern (e.g., Music124, Music115)
                # But keep AMCArtistImages and other patterns
                if re.search(r'/Music\d+/', artwork_url):
                    self.logger.info(f"🍎 ❌ FILTERED OUT Apple Music URL (contains /Music[digits]/): {artwork_url}")
                else:
                    self.logger.info(f"🍎 ✅ KEEPING Apple Music URL: {artwork_url}")
                    # Convert single artwork_url to images array format for consistency
                    apple_image = {
                        "url": artwork_url,
                        "width": 2000,  # Apple Music artworks are typically 2000x2000
                        "height": 2000,
                        "type": "apple_music_artist"
                    }
                    
                    sources.append({
                        "type": "apple_music",
                        "images": [apple_image]  # Wrap single image in array
                    })
                    self.logger.info(f"🍎 ✅ Added Apple Music source to priority list")
            else:
                self.logger.info(f"🍎 ❌ Apple Music artwork_url is empty or not found")
        else:
            self.logger.info(f"🍎 ❌ No Apple Music data found in raw_data")
        
        # Priority 2: Spotify
        if "spotify" in artist.raw_data:
            spotify_data = artist.raw_data["spotify"]
            self.logger.info(f"🎵 Spotify data found. Type: {type(spotify_data)}")
            
            # Handle both object attributes and dictionary keys
            spotify_images = None
            if hasattr(spotify_data, "images") and spotify_data.images:
                # Object with attributes
                spotify_images = spotify_data.images
                self.logger.info(f"🎵 Found images as object attribute")
            elif isinstance(spotify_data, dict) and "images" in spotify_data and spotify_data["images"]:
                # Dictionary with keys
                spotify_images = spotify_data["images"]
                self.logger.info(f"🎵 Found images as dictionary key")
            
            if spotify_images:
                self.logger.info(f"🎵 ✅ Spotify images found: {len(spotify_images)} images")
                sources.append({
                    "type": "spotify",
                    "images": spotify_images
                })
                self.logger.info(f"🎵 ✅ Added Spotify source to priority list")
            else:
                self.logger.info(f"🎵 ❌ Spotify data has no images")
        else:
            self.logger.info(f"🎵 ❌ No Spotify data found in raw_data")
        
        # Priority 3: Discogs (fallback - use largest available)
        if "discogs" in artist.raw_data:
            discogs_data = artist.raw_data["discogs"]
            self.logger.info(f"💿 Discogs data found. Type: {type(discogs_data)}")
            
            # Handle both object attributes and dictionary keys
            discogs_images = None
            if hasattr(discogs_data, "images") and discogs_data.images:
                # Object with attributes
                discogs_images = discogs_data.images
                self.logger.info(f"💿 Found images as object attribute")
            elif isinstance(discogs_data, dict) and "images" in discogs_data and discogs_data["images"]:
                # Dictionary with keys
                discogs_images = discogs_data["images"]
                self.logger.info(f"💿 Found images as dictionary key")
            
            if discogs_images:
                self.logger.info(f"💿 ✅ Discogs images found: {len(discogs_images)} images")
                
                # Sort Discogs images by size (largest first) if size info is available
                if discogs_images and isinstance(discogs_images[0], dict):
                    # Try to sort by width/height if available
                    try:
                        discogs_images = sorted(
                            discogs_images, 
                            key=lambda x: (x.get('width', 0) * x.get('height', 0)), 
                            reverse=True
                        )
                        self.logger.info(f"💿 ✅ Sorted Discogs images by size")
                    except (TypeError, KeyError):
                        # If sorting fails, just use the images as-is
                        self.logger.info(f"💿 ⚠️ Could not sort Discogs images, using as-is")
                        pass
                
                sources.append({
                    "type": "discogs",
                    "images": discogs_images
                })
                self.logger.info(f"💿 ✅ Added Discogs source to priority list")
            else:
                self.logger.info(f"💿 ❌ Discogs data has no images")
        else:
            self.logger.info(f"💿 ❌ No Discogs data found in raw_data")
        
        self.logger.info(f"🏁 Final image sources priority order: {[s['type'] for s in sources]}")
        return sources
    
    def _interactive_select_artist_match(self, service_name: str, search_results: Dict[str, Any], target_artist: str) -> Optional[Dict[str, Any]]:
        """Interactive selection of best artist match from search results."""
        import click
        from rich.console import Console
        from rich.table import Table
        
        console = Console()
        
        # Extract candidates based on service type
        candidates = []
        if service_name == "Apple Music":
            artists = search_results.get("results", {}).get("artists", {}).get("data", [])
            for artist in artists:
                attrs = artist.get("attributes", {})
                candidates.append({
                    "data": artist,
                    "name": attrs.get("name", "Unknown"),
                    "genres": ", ".join(attrs.get("genreNames", [])[:3]),  # Show first 3 genres
                    "url": attrs.get("url", ""),
                    "id": artist.get("id", "Unknown")
                })
        elif service_name == "Spotify":
            artists = search_results.get("artists", {}).get("items", [])
            for artist in artists:
                candidates.append({
                    "data": artist,
                    "name": artist.get("name", "Unknown"),
                    "genres": ", ".join(artist.get("genres", [])[:3]),  # Show first 3 genres
                    "followers": f"{artist.get('followers', {}).get('total', 0):,}",
                    "popularity": str(artist.get("popularity", 0)),
                    "id": artist.get("id", "Unknown")
                })
        elif service_name == "Last.fm":
            # Last.fm search results structure (if we add Last.fm interactive support later)
            artists = search_results.get("results", {}).get("artistmatches", {}).get("artist", [])
            for artist in artists:
                candidates.append({
                    "data": artist,
                    "name": artist.get("name", "Unknown"),
                    "listeners": f"{artist.get('listeners', 0):,}",
                    "url": artist.get("url", ""),
                    "mbid": artist.get("mbid", "Unknown")
                })
        
        if not candidates:
            console.print(f"[yellow]No artist results found for {service_name}[/yellow]")
            return None
        
        # Display results table
        console.print(f"\n[bold cyan]{service_name} artist search results for: {target_artist}[/bold cyan]")
        
        table = Table()
        table.add_column("Choice", style="cyan", no_wrap=True)
        table.add_column("Artist Name", style="white")
        
        if service_name == "Apple Music":
            table.add_column("Genres", style="green")
            table.add_column("ID", style="yellow")
        elif service_name == "Spotify":
            table.add_column("Genres", style="green")
            table.add_column("Followers", style="yellow")
            table.add_column("Popularity", style="blue")
        elif service_name == "Last.fm":
            table.add_column("Listeners", style="green")
            table.add_column("MBID", style="yellow")
        
        for i, candidate in enumerate(candidates, 1):
            if service_name == "Apple Music":
                table.add_row(
                    str(i),
                    candidate["name"],
                    candidate["genres"] or "No genres",
                    candidate["id"]
                )
            elif service_name == "Spotify":
                table.add_row(
                    str(i),
                    candidate["name"],
                    candidate["genres"] or "No genres",
                    candidate["followers"],
                    candidate["popularity"]
                )
            elif service_name == "Last.fm":
                table.add_row(
                    str(i),
                    candidate["name"],
                    candidate["listeners"],
                    candidate["mbid"]
                )
        
        table.add_row("0", "[dim]Skip this service[/dim]", "", "", "" if service_name == "Spotify" else "")
        console.print(table)
        
        # Get user selection
        while True:
            try:
                choice = click.prompt(
                    f"\nSelect artist match for {service_name} (0 to skip)", 
                    type=int,
                    default=0
                )
                
                if choice == 0:
                    console.print(f"[yellow]Skipping {service_name}[/yellow]")
                    return None
                elif 1 <= choice <= len(candidates):
                    selected = candidates[choice - 1]
                    console.print(f"[green]Selected: {selected['name']}[/green]")
                    return selected["data"]
                else:
                    console.print(f"[red]Invalid choice. Please select 0-{len(candidates)}[/red]")
            except (ValueError, click.Abort):
                console.print("[red]Invalid input. Please enter a number.[/red]")
                return None


class ArtistImageManager(ImageManager):
    """Specialized image manager for artist photos."""
    
    def __init__(self, base_path: str = "data/artists", config: Dict[str, Any] = None):
        """Initialize ArtistImageManager with base path for storing artist images."""
        super().__init__(base_path)
        self.config = config or {}
        
        # Override image sizes with config if available
        if config and hasattr(config, 'get') and config.get("image_sizes"):
            # Convert string format "2000x2000" to int for pixel values
            image_sizes = {}
            for size_name, size_str in config.get("image_sizes", {}).items():
                if "x" in size_str:
                    width_str = size_str.split("x")[0]
                    image_sizes[size_name] = int(width_str)
                else:
                    image_sizes[size_name] = int(size_str)
            self.image_sizes = image_sizes
    
    def create_artist_folder(self, artist_name: str) -> Path:
        """Create folder for artist with URL-safe name."""
        sanitized_name = self.sanitize_filename(artist_name)
        folder_path = self.base_path / sanitized_name
        folder_path.mkdir(exist_ok=True)
        return folder_path
    
    def download_artist_images(self, artist_name: str, artwork_url: str) -> Dict[str, Optional[Path]]:
        """Download artist images in multiple sizes."""
        if not artwork_url:
            logger.warning("No artwork URL provided for artist")
            return {}
        
        # Create artist folder
        artist_folder = self.create_artist_folder(artist_name)
        
        # Download images in different sizes
        downloaded_images = {}
        
        for size_name, size_pixels in self.image_sizes.items():
            # Get size-specific URL
            sized_url = self.get_artwork_url_with_size(artwork_url, size_pixels)
            
            # Create filename with artist name
            sanitized_name = self.sanitize_filename(artist_name)
            filename = f"{sanitized_name}-{size_name}.jpg"
            file_path = artist_folder / filename
            
            # Download image
            if self.download_image(sized_url, file_path):
                downloaded_images[size_name] = file_path
                logger.info(f"Downloaded {size_name} artist image for {artist_name}")
            else:
                downloaded_images[size_name] = None
                logger.warning(f"Failed to download {size_name} artist image for {artist_name}")
        
        return downloaded_images
    
    def download_artist_images_with_fallback(self, artist_name: str, image_sources: List[Dict[str, Any]]) -> Dict[str, Optional[Path]]:
        """Download artist images with fallback sources, prioritizing Apple Music (no /Music[digits]/) > Spotify > Discogs."""
        if not image_sources:
            logger.warning("No image sources provided for artist")
            return {}
        
        # Create artist folder
        artist_folder = self.create_artist_folder(artist_name)
        
        # Download images in different sizes
        downloaded_images = {}
        
        for size_name, size_pixels in self.image_sizes.items():
            downloaded_images[size_name] = None
            
            # Try each image source in order
            for source in image_sources:
                source_type = source.get("type", "unknown")
                images = source.get("images", [])
                
                if source_type == "apple_music":
                    # Select Apple Music image for target size
                    sized_url = self._select_best_apple_music_image(images, size_pixels)
                    if not sized_url:
                        continue
                elif source_type == "spotify":
                    # Select best Spotify image for target size
                    sized_url = self._select_best_spotify_image(images, size_pixels)
                    if not sized_url:
                        continue
                elif source_type == "lastfm":
                    # Select best Last.fm image
                    sized_url = self._select_best_lastfm_image(images, size_pixels)
                    if not sized_url:
                        continue
                elif source_type == "discogs":
                    # Select primary Discogs image
                    sized_url = self._select_discogs_image(images)
                    if not sized_url:
                        continue
                else:
                    continue
                
                # Create filename with artist name
                sanitized_name = self.sanitize_filename(artist_name)
                filename = f"{sanitized_name}-{size_name}.jpg"
                file_path = artist_folder / filename
                
                # Download image
                if self.download_image(sized_url, file_path):
                    downloaded_images[size_name] = file_path
                    logger.info(f"Downloaded {size_name} artist image for {artist_name} from {source_type}")
                    break  # Success, move to next size
                else:
                    logger.warning(f"Failed to download {size_name} artist image from {source_type}")
            
            if downloaded_images[size_name] is None:
                logger.warning(f"Failed to download {size_name} artist image for {artist_name} from all sources")
        
        return downloaded_images
    
    def _select_best_apple_music_image(self, apple_music_images: List[Dict], target_size: int) -> Optional[str]:
        """Select the best Apple Music image URL for the target size."""
        if not apple_music_images:
            return None
        
        # Apple Music images from our extraction are already filtered for /Music[digits]/ URLs
        # Just get the first (and likely only) image URL
        first_image = apple_music_images[0] if apple_music_images else None
        if first_image and isinstance(first_image, dict):
            base_url = first_image.get("url")
            if base_url:
                # Apply sizing using the same logic as ImageManager
                return self.get_artwork_url_with_size(base_url, target_size)
        
        return None
    
    def _select_best_spotify_image(self, spotify_images: List[Dict], target_size: int) -> Optional[str]:
        """Select the best Spotify image URL for the target size."""
        if not spotify_images:
            return None
        
        # Find the image with size closest to but not smaller than target
        best_image = None
        best_diff = float("inf")
        
        for img in spotify_images:
            if isinstance(img, dict) and img.get("url"):
                img_size = min(img.get("width", 0), img.get("height", 0))
                if img_size >= target_size:
                    diff = img_size - target_size
                    if diff < best_diff:
                        best_diff = diff
                        best_image = img
        
        # If no image is large enough, use the largest available
        if best_image is None:
            best_image = max(
                spotify_images,
                key=lambda x: (x.get("width", 0) * x.get("height", 0)) if isinstance(x, dict) else 0,
                default=None
            )
        
        return best_image.get("url") if best_image else None
    
    def _select_best_lastfm_image(self, lastfm_images: List[Dict], target_size: int) -> Optional[str]:
        """Select the best Last.fm image URL for the target size."""
        if not lastfm_images:
            return None
        
        # Last.fm images are usually categorized by size names
        size_priority = ["extralarge", "large", "medium", "small"]
        
        # Map target size to preferred Last.fm sizes
        if target_size >= 1000:
            preferred_sizes = ["extralarge", "large", "medium", "small"]
        elif target_size >= 500:
            preferred_sizes = ["large", "extralarge", "medium", "small"]
        else:
            preferred_sizes = ["medium", "large", "extralarge", "small"]
        
        # Find the best image based on size preference
        for size_name in preferred_sizes:
            for img in lastfm_images:
                if isinstance(img, dict) and img.get("size") == size_name and img.get("url"):
                    return img.get("url")
        
        # Fallback to first available image
        for img in lastfm_images:
            if isinstance(img, dict) and img.get("url"):
                return img.get("url")
        
        return None
    
    def _select_discogs_image(self, discogs_images: List[Dict]) -> Optional[str]:
        """Select the primary Discogs image URL."""
        if not discogs_images:
            return None
        
        # Look for primary image first
        for img in discogs_images:
            if hasattr(img, "type") and hasattr(img, "resource_url"):
                if img.type == "primary" and img.resource_url:
                    return img.resource_url
        
        # Fallback to first available image
        for img in discogs_images:
            if hasattr(img, "resource_url") and img.resource_url:
                return img.resource_url
        
        return None
    
    def save_artist_json(self, artist: Artist) -> Optional[Path]:
        """Save artist data as JSON in the artist folder."""
        artist_folder = self.create_artist_folder(artist.name)
        sanitized_name = self.sanitize_filename(artist.name)
        json_path = artist_folder / f"{sanitized_name}.json"
        
        try:
            # Use centralized serializer for consistent JSON output
            json_content = ArtistSerializer.to_json(artist, include_enrichment=True)
            
            with open(json_path, 'w', encoding='utf-8') as f:
                f.write(json_content)
            
            logger.info(f"Saved artist JSON: {json_path}")
            return json_path
            
        except Exception as e:
            logger.error(f"Failed to save artist JSON: {str(e)}")
            return None


# Make logger available for image manager methods
logger = logging.getLogger(__name__)