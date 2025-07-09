"""Music data orchestrator for coordinating API calls."""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from ..models import Release, Artist
from ..models.enrichment import DiscogsData, AppleMusicData, SpotifyData, WikipediaData, LastFmData
from ..services.discogs import DiscogsService
from ..services.apple_music import AppleMusicService
from ..services.spotify import SpotifyService
from ..services.wikipedia import WikipediaService
from ..services.lastfm import LastFmService
from ..services.base import ServiceError
from .image_manager import ImageManager
from .database import DatabaseManager
from .artist_orchestrator import ArtistDataOrchestrator


class MusicDataOrchestrator:
    """Orchestrates data collection from multiple music services."""
    
    def __init__(self, config: Dict[str, Any], logger: Optional[logging.Logger] = None):
        self.config = config
        self.logger = logger or logging.getLogger(__name__)
        self.services = {}
        self.interactive_mode = False
        self.search_override = None
        self.custom_cover = None
        self.preferred_image_source = None
        
        # Initialize image manager with configurable path
        data_path = config.get("data", {}).get("path", "data")
        releases_folder = config.get("releases", {}).get("path", "releases")
        releases_path = f"{data_path}/{releases_folder}"
        self.image_manager = ImageManager(releases_path, config)
        
        # Initialize database manager
        db_path = config.get("database", {}).get("path", "collection_cache.db")
        self.db_manager = DatabaseManager(db_path, logger)
        
        # Initialize artist orchestrator
        self.artist_orchestrator = ArtistDataOrchestrator(config, logger)
        
        # Initialize services
        self._initialize_services()
    
    def set_interactive_mode(self, enabled: bool):
        """Enable or disable interactive mode for manual match selection."""
        self.interactive_mode = enabled
    
    def set_search_override(self, search_query: str):
        """Set a custom search query to override the default artist + album search."""
        self.search_override = search_query
    
    def set_custom_cover(self, cover_url: str):
        """Set a custom cover URL to override the default album artwork."""
        self.custom_cover = cover_url
    
    def set_preferred_image_source(self, source: str):
        """Set a preferred image source for album artwork."""
        self.preferred_image_source = source
    
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
        if all(service_configs["apple_music"].get(k) for k in ["key_id", "team_id", "private_key_path"]):
            try:
                self.services["apple_music"] = AppleMusicService(service_configs["apple_music"], logger=self.logger)
                self.logger.info("Apple Music service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize Apple Music service: {str(e)}")
        
        # Initialize Spotify service
        if all(service_configs["spotify"].get(k) for k in ["client_id", "client_secret"]):
            try:
                self.services["spotify"] = SpotifyService(service_configs["spotify"], logger=self.logger)
                self.logger.info("Spotify service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize Spotify service: {str(e)}")
        
        # Initialize Wikipedia service (no auth required)
        try:
            self.services["wikipedia"] = WikipediaService(service_configs["wikipedia"], logger=self.logger)
            self.logger.info("Wikipedia service initialized")
        except Exception as e:
            self.logger.warning(f"Failed to initialize Wikipedia service: {str(e)}")
        
        # Initialize Last.fm service
        if service_configs["lastfm"].get("api_key"):
            try:
                self.services["lastfm"] = LastFmService(service_configs["lastfm"], logger=self.logger)
                self.logger.info("Last.fm service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize Last.fm service: {str(e)}")
    
    def get_release_by_discogs_id(self, discogs_id: str, force_refresh: bool = False) -> Optional[Release]:
        """Get a release by Discogs ID, using database cache if available."""
        # Check database first unless force refresh is requested
        if not force_refresh:
            cached_release = self.db_manager.get_release_by_discogs_id(discogs_id)
            if cached_release and self.db_manager.has_enriched_release(discogs_id):
                self.logger.info(f"Using cached data for Discogs ID: {discogs_id}")
                return cached_release
        
        if "discogs" not in self.services:
            self.logger.error("Discogs service not available")
            return None
        
        try:
            # Check if this release is in the user's collection to preserve date_added
            collection_item = self.db_manager.get_collection_item_by_discogs_id(discogs_id)
            collection_date_added = None
            if collection_item:
                collection_date_added = collection_item.date_added
                self.logger.info(f"Found release {discogs_id} in user's collection (local DB) with date_added: {collection_date_added}")
            else:
                # Fallback: Check Discogs API directly for collection status
                try:
                    collection_instances = self.services["discogs"].get_collection_release_instances(discogs_id)
                    if collection_instances:
                        # Get the earliest date_added from all instances
                        earliest_date = None
                        for instance in collection_instances:
                            if "date_added" in instance:
                                try:
                                    from datetime import datetime
                                    date_added = datetime.fromisoformat(instance["date_added"].replace("Z", "+00:00"))
                                    if earliest_date is None or date_added < earliest_date:
                                        earliest_date = date_added
                                except ValueError:
                                    continue
                        
                        if earliest_date:
                            collection_date_added = earliest_date
                            self.logger.info(f"Found release {discogs_id} in user's collection (Discogs API) with date_added: {collection_date_added}")
                except Exception as e:
                    self.logger.debug(f"Could not check collection via API for release {discogs_id}: {str(e)}")
            
            # Get release data from Discogs
            self.logger.info(f"Fetching release data for Discogs ID: {discogs_id}")
            discogs_data = self.services["discogs"].get_release_details(discogs_id)
            
            # Parse into Release model
            release = self.services["discogs"].parse_release_data(discogs_data)
            
            # Preserve date_added from collection if it exists
            if collection_date_added:
                release.date_added = collection_date_added
            
            # Enrich with other services
            release = self.enrich_release(release)
            
            # Save enriched release to database
            try:
                self.db_manager.save_release(release)
                self.logger.info(f"Saved enriched release {discogs_id} to database")
            except Exception as e:
                self.logger.warning(f"Failed to save release to database: {str(e)}")
            
            return release
            
        except ServiceError as e:
            self.logger.error(f"Failed to get release by Discogs ID {discogs_id}: {str(e)}")
            return None
    
    def enrich_release(self, release: Release) -> Release:
        """Enrich a release with data from all available services."""
        # Get primary artist name for searches
        primary_artist = release.get_artist_names()[0] if release.get_artist_names() else ""
        
        # Check and enrich artists if not in cache
        for artist in release.artists:
            self.logger.info(f"Checking cache for artist: {artist.name}")
            
            # Check if artist is already enriched in cache
            if not self.db_manager.has_enriched_artist(artist.name):
                self.logger.info(f"Artist {artist.name} not in cache, fetching data...")
                
                # Get enriched artist data, passing the existing artist to preserve Discogs ID
                enriched_artist = self.artist_orchestrator.get_artist_by_name(artist.name, existing_artist=artist)
                
                if enriched_artist:
                    
                    # Update the artist in the release with enriched data
                    artist.biography = enriched_artist.biography
                    artist.wikipedia_url = enriched_artist.wikipedia_url
                    artist.apple_music_id = enriched_artist.apple_music_id
                    artist.apple_music_url = enriched_artist.apple_music_url
                    artist.spotify_id = enriched_artist.spotify_id
                    artist.spotify_url = enriched_artist.spotify_url
                    artist.lastfm_url = enriched_artist.lastfm_url
                    artist.lastfm_mbid = enriched_artist.lastfm_mbid
                    artist.genres = enriched_artist.genres
                    artist.images = enriched_artist.images
                    artist.local_images = enriched_artist.local_images
                    artist.raw_data = enriched_artist.raw_data
                    artist.updated_at = enriched_artist.updated_at
                    artist.discogs_id = enriched_artist.discogs_id
                    artist.discogs_url = enriched_artist.discogs_url
                    
                    self.logger.info(f"Successfully enriched artist: {artist.name}")
            else:
                # Load cached artist data
                cached_artist = self.db_manager.get_artist_by_name(artist.name)
                if cached_artist:
                    # Update the artist in the release with cached data
                    artist.biography = cached_artist.biography
                    artist.wikipedia_url = cached_artist.wikipedia_url
                    artist.apple_music_id = cached_artist.apple_music_id
                    artist.apple_music_url = cached_artist.apple_music_url
                    artist.spotify_id = cached_artist.spotify_id
                    artist.spotify_url = cached_artist.spotify_url
                    artist.lastfm_url = cached_artist.lastfm_url
                    artist.lastfm_mbid = cached_artist.lastfm_mbid
                    artist.genres = cached_artist.genres
                    artist.images = cached_artist.images
                    artist.local_images = cached_artist.local_images
                    artist.raw_data = cached_artist.raw_data
                    artist.updated_at = cached_artist.updated_at
                    
                    self.logger.info(f"Using cached data for artist: {artist.name}")
        
        # Set Discogs release name (base reference)
        release.release_name_discogs = release.title
        
        # Enrich with Apple Music
        if "apple_music" in self.services:
            if self.search_override:
                apple_data = self._get_apple_music_data_by_query(self.search_override)
            else:
                apple_data = self._get_apple_music_data(primary_artist, release.title, release.year)
            
            if apple_data:
                release.raw_data["apple_music"] = apple_data
                
                # Extract useful data
                if apple_data.artwork_url:
                    from ..models import Image
                    apple_image = Image(
                        url=apple_data.artwork_url,
                        type="apple_music_artwork",
                        width=2000,
                        height=2000
                    )
                    release.add_image(apple_image)
                
                if apple_data.id:
                    release.apple_music_id = apple_data.id
                if apple_data.url:
                    release.apple_music_url = apple_data.url
                
                # Extract Apple Music album name from raw_data
                if hasattr(apple_data, 'raw_data') and apple_data.raw_data:
                    attributes = apple_data.raw_data.get('attributes', {})
                    if attributes.get('name'):
                        release.release_name_apple_music = attributes['name']
        
        # Enrich with Spotify
        if "spotify" in self.services:
            if self.search_override:
                spotify_data = self._get_spotify_data_by_query(self.search_override)
            else:
                spotify_data = self._get_spotify_data(primary_artist, release.title, release.year)
            
            if spotify_data:
                release.raw_data["spotify"] = spotify_data
                
                if spotify_data.id:
                    release.spotify_id = spotify_data.id
                if spotify_data.url:
                    release.spotify_url = spotify_data.url
                
                # Extract Spotify album name from raw_data
                if hasattr(spotify_data, 'raw_data') and spotify_data.raw_data:
                    if spotify_data.raw_data.get('name'):
                        release.release_name_spotify = spotify_data.raw_data['name']
        
        # Enrich with Last.fm
        if "lastfm" in self.services:
            if self.search_override:
                lastfm_data = self._get_lastfm_data_by_query(self.search_override)
            else:
                lastfm_data = self._get_lastfm_data(primary_artist, release.title)
            
            if lastfm_data:
                release.raw_data["lastfm"] = lastfm_data
                
                if lastfm_data.url:
                    release.lastfm_url = lastfm_data.url
                if lastfm_data.tags:
                    # Add tags as genres if not already present
                    for tag in lastfm_data.tags[:5]:  # Limit to top 5 tags
                        if tag not in release.genres:
                            release.genres.append(tag)
        
        # Note: Artist enrichment with Wikipedia is now handled in the artist enrichment block above
        
        release.updated_at = datetime.now()
        
        # Download artwork with fallback sources
        discogs_id = str(release.discogs_id) if release.discogs_id else "unknown"
        try:
            # If custom cover is provided, use it instead of extracted sources
            if self.custom_cover:
                self.logger.info(f"Using custom cover URL: {self.custom_cover}")
                # Add custom cover as an image source
                from ..models import Image
                custom_image = Image(
                    url=self.custom_cover,
                    type="custom_cover",
                    width=2000,  # Assume high resolution
                    height=2000
                )
                release.add_image(custom_image)
                
                # Download the custom cover
                downloaded_images = self.image_manager.download_album_artwork_with_fallback(
                    release.title, 
                    discogs_id, 
                    [{"url": self.custom_cover, "type": "custom_cover"}]
                )
                
                if downloaded_images:
                    self.logger.info(f"Downloaded custom cover for {release.title}")
                    release.local_images = downloaded_images
                else:
                    self.logger.warning(f"Failed to download custom cover from {self.custom_cover}")
            else:
                # Handle v1 flag if preferred
                if self.preferred_image_source == "v1":
                    from ..utils.v1_site_helper import V1SiteHelper
                    
                    self.logger.info(f"Using v1.russ.fm for album artwork...")
                    try:
                        release_found = V1SiteHelper.find_release_by_discogs_id(str(release.discogs_id))
                        
                        if release_found and release_found.get("coverImage"):
                            v1_image_url = release_found["coverImage"]
                            self.logger.info(f"Found release in v1 index with image: {v1_image_url}")
                            
                            # Download the v1 image
                            downloaded_images = self.image_manager.download_album_artwork_with_fallback(
                                release.title, 
                                discogs_id, 
                                [{"url": v1_image_url, "type": "v1"}]
                            )
                            
                            if downloaded_images:
                                self.logger.info(f"Downloaded v1 artwork for {release.title}")
                                release.local_images = downloaded_images
                            else:
                                self.logger.warning(f"Failed to download v1 artwork from {v1_image_url}")
                        else:
                            self.logger.info(f"Release {release.discogs_id} not found in v1.russ.fm, falling back to other sources")
                            # Fall back to normal extraction
                            image_sources = self.image_manager.extract_image_sources(release, preferred_source=self.preferred_image_source)
                            if image_sources:
                                downloaded_images = self.image_manager.download_album_artwork_with_fallback(
                                    release.title, 
                                    discogs_id, 
                                    image_sources
                                )
                                
                                if downloaded_images:
                                    release.local_images = downloaded_images
                    except Exception as e:
                        self.logger.warning(f"Error accessing v1.russ.fm data: {str(e)}")
                        # Fall back to normal extraction
                        image_sources = self.image_manager.extract_image_sources(release, preferred_source=self.preferred_image_source)
                        if image_sources:
                            downloaded_images = self.image_manager.download_album_artwork_with_fallback(
                                release.title, 
                                discogs_id, 
                                image_sources
                            )
                            
                            if downloaded_images:
                                release.local_images = downloaded_images
                else:
                    # Use normal artwork extraction and download
                    image_sources = self.image_manager.extract_image_sources(release, preferred_source=self.preferred_image_source)
                    if image_sources:
                        downloaded_images = self.image_manager.download_album_artwork_with_fallback(
                            release.title, 
                            discogs_id, 
                            image_sources
                        )
                        
                        # Log successful downloads
                        successful_downloads = [size for size, path in downloaded_images.items() if path]
                        if successful_downloads:
                            self.logger.info(f"Downloaded artwork for {release.title}: {', '.join(successful_downloads)}")
                        
                        # Store local image paths in release
                        release.local_images = downloaded_images
                    else:
                        self.logger.warning(f"No image sources found for {release.title}")
                
        except Exception as e:
            self.logger.warning(f"Failed to download artwork for {release.title}: {str(e)}")
        
        # Save comprehensive JSON data to releases folder using centralized serializer
        try:
            self.image_manager.save_release_json(release, release.title, discogs_id)
        except Exception as e:
            self.logger.warning(f"Failed to save comprehensive JSON for {release.title}: {str(e)}")
        
        return release
    
    def _get_apple_music_data(self, artist: str, album: str, year: Optional[int] = None) -> Optional[AppleMusicData]:
        """Get Apple Music data for an album."""
        try:
            service = self.services["apple_music"]
            search_results = service.search_release(artist, album)
            
            # Debug logging
            albums = search_results.get("results", {}).get("albums", {}).get("data", [])
            if albums:
                self.logger.info(f"Apple Music: Found {len(albums)} results for '{artist} - {album}'")
            else:
                self.logger.info(f"Apple Music: No results found for '{artist} - {album}'")
            
            if self.interactive_mode:
                selected_match = self._interactive_select_match("Apple Music", search_results, artist, album)
                if selected_match:
                    return service.create_apple_music_enrichment(selected_match)
            else:
                best_match = service.find_best_match(search_results, artist, album, year=year)
                if best_match:
                    match_name = best_match.get('attributes', {}).get('name', 'Unknown')
                    self.logger.info(f"Apple Music: Using match: {match_name}")
                    return service.create_apple_music_enrichment(best_match)
                else:
                    self.logger.info(f"Apple Music: No suitable match found for '{artist} - {album}'")
            
        except Exception as e:
            self.logger.warning(f"Failed to get Apple Music data for {artist} - {album}: {str(e)}")
        
        return None
    
    def _get_apple_music_data_by_query(self, query: str) -> Optional[AppleMusicData]:
        """Get Apple Music data using a custom search query."""
        try:
            service = self.services["apple_music"]
            search_results = service.search_release_by_query(query)
            
            if self.interactive_mode:
                selected_match = self._interactive_select_match("Apple Music", search_results, "", query)
                if selected_match:
                    return service.create_apple_music_enrichment(selected_match)
            else:
                # For custom queries, just take the first result if available
                albums = search_results.get("results", {}).get("albums", {}).get("data", [])
                if albums:
                    self.logger.info(f"Apple Music: Found {len(albums)} results for '{query}', using first match: {albums[0].get('attributes', {}).get('name', 'Unknown')}")
                    return service.create_apple_music_enrichment(albums[0])
                else:
                    self.logger.info(f"Apple Music: No results found for '{query}'")
            
        except Exception as e:
            self.logger.warning(f"Failed to get Apple Music data for query '{query}': {str(e)}")
        
        return None
    
    def _get_spotify_data(self, artist: str, album: str, year: Optional[int] = None) -> Optional[SpotifyData]:
        """Get Spotify data for an album."""
        try:
            service = self.services["spotify"]
            search_results = service.search_release(artist, album)
            
            if self.interactive_mode:
                selected_match = self._interactive_select_match("Spotify", search_results, artist, album)
                if selected_match:
                    return service.create_spotify_enrichment(selected_match)
            else:
                best_match = service.find_best_match(search_results, artist, album, year=year)
                if best_match:
                    return service.create_spotify_enrichment(best_match)
            
        except Exception as e:
            self.logger.warning(f"Failed to get Spotify data for {artist} - {album}: {str(e)}")
        
        return None
    
    def _get_spotify_data_by_query(self, query: str) -> Optional[SpotifyData]:
        """Get Spotify data using a custom search query."""
        try:
            service = self.services["spotify"]
            search_results = service.search_release_by_query(query)
            
            if self.interactive_mode:
                selected_match = self._interactive_select_match("Spotify", search_results, "", query)
                if selected_match:
                    return service.create_spotify_enrichment(selected_match)
            else:
                # For custom queries, just take the first result if available
                albums = search_results.get("albums", {}).get("items", [])
                if albums:
                    self.logger.info(f"Spotify: Found {len(albums)} results for '{query}', using first match: {albums[0].get('name', 'Unknown')}")
                    return service.create_spotify_enrichment(albums[0])
                else:
                    self.logger.info(f"Spotify: No results found for '{query}'")
            
        except Exception as e:
            self.logger.warning(f"Failed to get Spotify data for query '{query}': {str(e)}")
        
        return None
    
    def _get_lastfm_data(self, artist: str, album: str) -> Optional[LastFmData]:
        """Get Last.fm data for an album."""
        try:
            service = self.services["lastfm"]
            return service.find_best_album_match(artist, album)
            
        except Exception as e:
            self.logger.warning(f"Failed to get Last.fm data for {artist} - {album}: {str(e)}")
        
        return None
    
    def _get_lastfm_data_by_query(self, query: str) -> Optional[LastFmData]:
        """Get Last.fm data using a custom search query."""
        try:
            service = self.services["lastfm"]
            # For Last.fm, we'll pass the search override as the album parameter and empty string as artist
            return service.find_best_album_match("", query)
            
        except Exception as e:
            self.logger.warning(f"Failed to get Last.fm data for query '{query}': {str(e)}")
        
        return None
    
    def _get_wikipedia_artist_data(self, artist: str) -> Optional[WikipediaData]:
        """Get Wikipedia data for an artist."""
        try:
            service = self.services["wikipedia"]
            return service.find_best_artist_match(artist)
            
        except Exception as e:
            self.logger.warning(f"Failed to get Wikipedia data for {artist}: {str(e)}")
        
        return None
    
    def get_collection_items(self, username: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get collection items from Discogs."""
        if "discogs" not in self.services:
            self.logger.error("Discogs service not available")
            return []
        
        try:
            return self.services["discogs"].get_user_collection(username)
        except Exception as e:
            self.logger.error(f"Failed to get collection: {str(e)}")
            return []
    
    def process_collection(self, username: Optional[str] = None) -> List[Release]:
        """Process entire collection and enrich all releases."""
        collection_items = self.get_collection_items(username)
        releases = []
        
        for item in collection_items:
            try:
                # Parse collection item
                collection_item = self.services["discogs"].parse_collection_item(item)
                
                # Enrich the release
                enriched_release = self.enrich_release(collection_item.release)
                releases.append(enriched_release)
                
                self.logger.info(f"Processed: {enriched_release.title}")
                
            except Exception as e:
                self.logger.error(f"Failed to process collection item: {str(e)}")
                continue
        
        return releases
    
    def get_available_services(self) -> List[str]:
        """Get list of available services."""
        return list(self.services.keys())
    
    def test_services(self) -> Dict[str, bool]:
        """Test all available services."""
        results = {}
        
        for service_name, service in self.services.items():
            try:
                service.authenticate()
                results[service_name] = True
                self.logger.info(f"{service_name} service: OK")
            except Exception as e:
                results[service_name] = False
                self.logger.error(f"{service_name} service: FAILED - {str(e)}")
        
        return results
    
    def _interactive_select_match(self, service_name: str, search_results: Dict[str, Any], target_artist: str, target_album: str) -> Optional[Dict[str, Any]]:
        """Interactive selection of best match from search results."""
        import click
        from rich.console import Console
        from rich.table import Table
        
        console = Console()
        
        # Extract candidates based on service type
        candidates = []
        if service_name == "Apple Music":
            albums = search_results.get("results", {}).get("albums", {}).get("data", [])
            for album in albums:
                attrs = album.get("attributes", {})
                candidates.append({
                    "data": album,
                    "title": attrs.get("name", "Unknown"),
                    "artist": attrs.get("artistName", "Unknown"),
                    "year": attrs.get("releaseDate", "Unknown")[:4] if attrs.get("releaseDate") else "Unknown",
                    "type": attrs.get("albumType", "Unknown")
                })
        elif service_name == "Spotify":
            albums = search_results.get("albums", {}).get("items", [])
            for album in albums:
                artists = [a.get("name", "") for a in album.get("artists", [])]
                candidates.append({
                    "data": album,
                    "title": album.get("name", "Unknown"),
                    "artist": ", ".join(artists),
                    "year": album.get("release_date", "Unknown")[:4] if album.get("release_date") else "Unknown",
                    "type": album.get("album_type", "Unknown")
                })
        
        if not candidates:
            console.print(f"[yellow]No results found for {service_name}[/yellow]")
            return None
        
        # Display results table
        console.print(f"\n[bold cyan]{service_name} search results for: {target_artist} - {target_album}[/bold cyan]")
        
        table = Table()
        table.add_column("Choice", style="cyan", no_wrap=True)
        table.add_column("Title", style="white")
        table.add_column("Artist", style="green")
        table.add_column("Year", style="yellow")
        table.add_column("Type", style="blue")
        
        for i, candidate in enumerate(candidates, 1):
            table.add_row(
                str(i),
                candidate["title"],
                candidate["artist"],
                candidate["year"],
                candidate["type"]
            )
        
        table.add_row("0", "[dim]Skip this service[/dim]", "", "", "")
        console.print(table)
        
        # Get user selection
        while True:
            try:
                choice = click.prompt(
                    f"\nSelect match for {service_name} (0 to skip)", 
                    type=int,
                    default=0
                )
                
                if choice == 0:
                    console.print(f"[yellow]Skipping {service_name}[/yellow]")
                    return None
                elif 1 <= choice <= len(candidates):
                    selected = candidates[choice - 1]
                    console.print(f"[green]Selected: {selected['title']} by {selected['artist']}[/green]")
                    return selected["data"]
                else:
                    console.print(f"[red]Invalid choice. Please select 0-{len(candidates)}[/red]")
            except (ValueError, click.Abort):
                console.print("[red]Invalid input. Please enter a number.[/red]")
    
