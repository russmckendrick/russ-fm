"""Artist data orchestrator for coordinating API calls."""

import logging
import re
import difflib
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass

from ..models import Artist, Image
from ..models.enrichment import ArtistAppleMusicData, ArtistSpotifyData, ArtistLastFmData, ArtistTheAudioDBData
from ..services.discogs import DiscogsService
from ..services.apple_music import AppleMusicService
from ..services.spotify import SpotifyService
from ..services.lastfm import LastFmService
from ..services.wikipedia import WikipediaService
from ..services.theaudiodb import TheAudioDBService
from .image_manager import ImageManager
from .database import DatabaseManager
from .serializers import ArtistSerializer


@dataclass
class ReleaseMatch:
    """Represents a matched release between services."""
    discogs_title: str
    service_title: str
    match_score: float
    match_type: str  # 'exact', 'fuzzy', 'partial'


class ReleaseVerifier:
    """Verifies artist matches by comparing releases."""
    
    @staticmethod
    def normalize_title(title: str) -> str:
        """Normalize album title for comparison."""
        # Remove common suffixes
        title = re.sub(r'\s*\([^)]*\)\s*$', '', title)  # Remove (Deluxe Edition), etc.
        title = re.sub(r'\s*\[[^\]]*\]\s*$', '', title)  # Remove [Remastered], etc.
        
        # Remove special characters but keep spaces
        title = re.sub(r'[^\w\s]', '', title)
        
        # Normalize whitespace and case
        title = ' '.join(title.split()).lower()
        
        # Remove common words that cause mismatches
        skip_words = {'the', 'a', 'an', 'and', '&', 'remastered', 'deluxe', 'edition', 
                      'expanded', 'anniversary', 'reissue', 'bonus', 'tracks', 'disc'}
        words = [w for w in title.split() if w not in skip_words]
        
        return ' '.join(words)
    
    @staticmethod
    def match_releases(discogs_releases: List[str], service_releases: List[str]) -> List[ReleaseMatch]:
        """Match releases between Discogs and a service."""
        matches = []
        
        # Normalize all titles
        normalized_discogs = {ReleaseVerifier.normalize_title(r): r for r in discogs_releases}
        normalized_service = {ReleaseVerifier.normalize_title(r): r for r in service_releases}
        
        # First pass: exact matches
        for norm_discogs, orig_discogs in normalized_discogs.items():
            if norm_discogs in normalized_service:
                matches.append(ReleaseMatch(
                    discogs_title=orig_discogs,
                    service_title=normalized_service[norm_discogs],
                    match_score=1.0,
                    match_type='exact'
                ))
        
        # Second pass: fuzzy matches for unmatched releases
        unmatched_discogs = {k: v for k, v in normalized_discogs.items() 
                           if not any(m.discogs_title == v for m in matches)}
        unmatched_service = {k: v for k, v in normalized_service.items() 
                           if not any(m.service_title == v for m in matches)}
        
        for norm_discogs, orig_discogs in unmatched_discogs.items():
            best_match = None
            best_score = 0.0
            
            for norm_service, orig_service in unmatched_service.items():
                # Calculate similarity
                score = difflib.SequenceMatcher(None, norm_discogs, norm_service).ratio()
                
                # Boost score if key words match
                discogs_words = set(norm_discogs.split())
                service_words = set(norm_service.split())
                if discogs_words and service_words:
                    word_overlap = len(discogs_words & service_words) / min(len(discogs_words), len(service_words))
                    score = (score + word_overlap) / 2
                
                if score > best_score and score > 0.7:  # 70% threshold
                    best_score = score
                    best_match = orig_service
            
            if best_match:
                matches.append(ReleaseMatch(
                    discogs_title=orig_discogs,
                    service_title=best_match,
                    match_score=best_score,
                    match_type='fuzzy'
                ))
        
        return matches
    
    @staticmethod
    def calculate_confidence(matches: List[ReleaseMatch], total_discogs: int) -> Tuple[float, str]:
        """Calculate confidence score based on release matches."""
        if total_discogs == 0:
            return 0.0, "NO_RELEASES"
        
        match_percentage = len(matches) / total_discogs
        
        # Calculate weighted score based on match quality
        if matches:
            avg_match_score = sum(m.match_score for m in matches) / len(matches)
            confidence_score = match_percentage * avg_match_score
        else:
            confidence_score = 0.0
        
        # Determine confidence level
        if match_percentage >= 0.5 and len(matches) >= 2:
            confidence = "HIGH"
        elif match_percentage >= 0.3 or len(matches) >= 1:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"
        
        # Special cases
        if len(matches) >= 5:
            confidence = "HIGH"  # Many matches = high confidence
        elif total_discogs == 1 and len(matches) == 1 and matches[0].match_score > 0.9:
            confidence = "HIGH"  # Single perfect match
        
        return confidence_score, confidence


class ArtistDataOrchestrator:
    """Orchestrates artist data collection from multiple music services."""
    
    def __init__(self, config: Dict[str, Any], logger: Optional[logging.Logger] = None, enabled_services: Optional[List[str]] = None, add_services: Optional[List[str]] = None):
        self.config = config
        self.logger = logger or logging.getLogger(__name__)
        self.services = {}
        self.interactive_mode = False
        self.custom_image = None
        self.preferred_image_source = None
        self.enabled_services = enabled_services  # If None, all services are enabled
        self.add_services = add_services  # Services to add to existing data
        
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
            "theaudiodb": self.config.get("TheAudioDB", {}),
        }
        
        # Initialize Discogs service
        if self._is_service_enabled("discogs") and service_configs["discogs"].get("access_token"):
            try:
                self.services["discogs"] = DiscogsService(service_configs["discogs"], logger=self.logger)
                self.logger.info("Discogs service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize Discogs service: {str(e)}")
        
        # Initialize Apple Music service
        if self._is_service_enabled("apple_music"):
            try:
                self.services["apple_music"] = AppleMusicService(service_configs["apple_music"], logger=self.logger)
                self.logger.info("Apple Music service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize Apple Music service: {str(e)}")
        
        # Initialize Spotify service
        if self._is_service_enabled("spotify"):
            try:
                self.services["spotify"] = SpotifyService(service_configs["spotify"], logger=self.logger)
                self.logger.info("Spotify service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize Spotify service: {str(e)}")
        
        # Initialize Wikipedia service
        if self._is_service_enabled("wikipedia"):
            try:
                self.services["wikipedia"] = WikipediaService(service_configs["wikipedia"], logger=self.logger)
                self.logger.info("Wikipedia service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize Wikipedia service: {str(e)}")
        
        # Initialize Last.fm service
        if self._is_service_enabled("lastfm"):
            try:
                self.services["lastfm"] = LastFmService(service_configs["lastfm"], logger=self.logger)
                self.logger.info("Last.fm service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize Last.fm service: {str(e)}")
        
        # Initialize TheAudioDB service
        if self._is_service_enabled("theaudiodb") and service_configs["theaudiodb"].get("api_token"):
            try:
                self.services["theaudiodb"] = TheAudioDBService(self.config, logger=self.logger)
                self.logger.info("TheAudioDB service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize TheAudioDB service: {str(e)}")
    
    def _is_service_enabled(self, service_name: str) -> bool:
        """Check if a service is enabled based on the enabled_services or add_services list."""
        if self.enabled_services is not None:
            # If specific services are enabled, only use those
            return service_name in self.enabled_services
        elif self.add_services is not None:
            # If adding services, enable all services (we'll filter in enrich_artist)
            return True
        else:
            # If no specific services are requested, all are enabled
            return True
    
    def set_interactive_mode(self, enabled: bool):
        """Enable or disable interactive mode for manual artist match selection."""
        self.interactive_mode = enabled
        self.logger.info(f"Artist interactive mode: {'enabled' if enabled else 'disabled'}")
    
    def set_custom_image(self, image_url: str):
        """Set a custom image URL to override the default artist image."""
        self.custom_image = image_url
    
    def set_preferred_image_source(self, source: str):
        """Set preferred image source priority."""
        valid_sources = ['apple_music', 'spotify', 'theaudiodb', 'discogs', 'v1']
        if source.lower() in valid_sources:
            self.preferred_image_source = source.lower()
            self.logger.info(f"Set preferred image source to: {source}")
        else:
            self.logger.warning(f"Invalid image source '{source}'. Valid sources: {valid_sources}")
            self.preferred_image_source = None
    
    def get_artist_by_name(self, artist_name: str, force_refresh: bool = False, existing_artist: Optional[Artist] = None) -> Optional[Artist]:
        """Get comprehensive artist information by name."""
        # Always check database first to get existing artist data (including discogs_id)
        cached_artist = self.db_manager.get_artist_by_name(artist_name)
        if cached_artist:
            self.logger.info(f"Found cached artist: {cached_artist.name}, discogs_id: {cached_artist.discogs_id}")
            # If not forcing refresh and artist is enriched, return cached data
            # BUT: if selective services are enabled OR add services are specified, always re-enrich
            if not force_refresh and self.enabled_services is None and self.add_services is None and self.db_manager.has_enriched_artist(artist_name):
                self.logger.info(f"Using cached data for artist: {artist_name}")
                return cached_artist
            elif self.enabled_services is not None:
                self.logger.info(f"Selective services enabled ({self.enabled_services}), re-enriching artist: {artist_name}")
            elif self.add_services is not None:
                self.logger.info(f"Adding services ({self.add_services}) to existing data for artist: {artist_name}")
        else:
            self.logger.info(f"No cached artist found for: {artist_name}")
        
        # Use existing artist if provided (with Discogs ID), otherwise use cached or create new
        if existing_artist:
            artist = existing_artist
            self.logger.info(f"Using existing artist: {artist.name}, discogs_id: {artist.discogs_id}")
        elif cached_artist:
            # Use cached artist as base (preserves discogs_id and other data)
            artist = cached_artist
            self.logger.info(f"Using cached artist as base: {artist.name}, discogs_id: {artist.discogs_id}")
        else:
            artist = Artist(name=artist_name)
            self.logger.info(f"Created new artist: {artist.name}, discogs_id: {artist.discogs_id}")
        
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
        
        # If add_services is specified, ONLY add raw data for those services without ANY other processing
        if self.add_services is not None:
            self.logger.info(f"MINIMAL MODE: Only adding raw data for: {self.add_services}")
            
            # Make a copy of the existing artist to avoid any modifications
            original_raw_data = artist.raw_data.copy()
            
            # Only add raw TheAudioDB data - don't touch ANYTHING else
            if "theaudiodb" in self.add_services and "theaudiodb" in self.services:
                self.logger.info(f"Fetching TheAudioDB raw data for {artist_name}")
                theaudiodb_data = self._get_theaudiodb_artist_data(artist_name, artist.lastfm_mbid)
                if theaudiodb_data:
                    # Convert dataclass to dict before storing
                    from dataclasses import asdict
                    theaudiodb_dict = asdict(theaudiodb_data)
                    
                    # ONLY add to raw_data - preserve everything else exactly as it was
                    artist.raw_data["theaudiodb"] = theaudiodb_dict
                    
                    # Also update biography (ALWAYS prefer TheAudioDB)
                    theaudiodb_biography = self._get_best_theaudiodb_biography(theaudiodb_data)
                    if theaudiodb_biography:
                        artist.biography = theaudiodb_biography
                        self.logger.info(f"Updated biography from TheAudioDB for {artist_name}")
                    
                    self.logger.info(f"✅ Added ONLY TheAudioDB raw data for {artist_name}")
                    self.logger.info(f"Raw data keys now: {list(artist.raw_data.keys())}")
                else:
                    self.logger.info(f"❌ No TheAudioDB data found for {artist_name}")
            
            # Update ONLY the timestamp - nothing else
            artist.updated_at = datetime.now()
            
            # Save to database and JSON - but don't run any other enrichment
            if self.db_manager.save_artist(artist):
                self.logger.info(f"✅ Saved artist {artist_name} to database with TheAudioDB data")
            
            try:
                self.image_manager.save_artist_json(artist)
                self.logger.info(f"✅ Saved artist JSON for {artist_name}")
            except Exception as e:
                self.logger.warning(f"Failed to save artist JSON: {str(e)}")
            
            return artist
        
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
            else:
                # If service was skipped or returned no data, clear Apple Music metadata
                self.logger.info(f"Apple Music data not available, clearing Apple Music metadata for {artist_name}")
                artist.raw_data["apple_music"] = {}
                artist.apple_music_id = None
                artist.apple_music_url = None
        
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
            else:
                # If service was skipped or returned no data, clear Spotify metadata
                self.logger.info(f"Spotify data not available, clearing Spotify metadata for {artist_name}")
                artist.raw_data["spotify"] = {}
                artist.spotify_id = None
                artist.spotify_url = None
                artist.popularity = None
                artist.followers = None
        
        # Enrich with Last.fm
        if "lastfm" in self.services:
            lastfm_data = self._get_lastfm_artist_data(artist_name)
            if lastfm_data:
                artist.raw_data["lastfm"] = lastfm_data
                
                if lastfm_data.mbid:
                    artist.lastfm_mbid = lastfm_data.mbid
                if lastfm_data.url:
                    artist.lastfm_url = lastfm_data.url
                # Note: Don't set biography from Last.fm here - we'll prioritize Discogs profile later
                # NOTE: Last.fm tags are intentionally NOT added to genres
                # to maintain higher quality genre data from other sources
                
                # Add Last.fm images
                for img_data in lastfm_data.images:
                    if isinstance(img_data, dict) and img_data.get("url"):
                        lastfm_image = Image(
                            url=img_data.get("url", ""),
                            type=f"lastfm_artist_{img_data.get('size', 'unknown')}"
                        )
                        artist.add_image(lastfm_image)
            else:
                # If service was skipped or returned no data, clear Last.fm metadata
                self.logger.info(f"Last.fm data not available, clearing Last.fm metadata for {artist_name}")
                artist.raw_data["lastfm"] = {}
                artist.lastfm_mbid = None
                artist.lastfm_url = None
        
        # Enrich with TheAudioDB (highest priority for biography)
        if "theaudiodb" in self.services:
            theaudiodb_data = self._get_theaudiodb_artist_data(artist_name, artist.lastfm_mbid)
            if theaudiodb_data:
                # Convert dataclass to dict before storing
                from dataclasses import asdict
                theaudiodb_dict = asdict(theaudiodb_data)
                artist.raw_data["theaudiodb"] = theaudiodb_dict
                
                # Update artist fields if not already set
                if theaudiodb_data.formed_year and not hasattr(artist, 'formed_year'):
                    artist.formed_year = theaudiodb_data.formed_year
                if theaudiodb_data.genre and theaudiodb_data.genre not in artist.genres:
                    artist.genres.append(theaudiodb_data.genre)
                if theaudiodb_data.style and theaudiodb_data.style not in artist.genres:
                    artist.genres.append(theaudiodb_data.style)
                if theaudiodb_data.website and not hasattr(artist, 'website'):
                    artist.website = theaudiodb_data.website
                if theaudiodb_data.country and not hasattr(artist, 'country'):
                    artist.country = theaudiodb_data.country
                
                # Prefer TheAudioDB biography with fallback through languages (ALWAYS prefer TheAudioDB)
                theaudiodb_biography = self._get_best_theaudiodb_biography(theaudiodb_data)
                if theaudiodb_biography:
                    artist.biography = theaudiodb_biography
                    self.logger.info(f"Updated biography from TheAudioDB for {artist_name}")
                
                # Add TheAudioDB images
                for img in theaudiodb_data.images:
                    artist.add_image(img)
            else:
                # If service was skipped or returned no data, clear TheAudioDB metadata
                self.logger.info(f"TheAudioDB data not available, clearing TheAudioDB metadata for {artist_name}")
                artist.raw_data["theaudiodb"] = {}
        
        # Enrich with Wikipedia (fallback for biography)
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

        # Enrich with Discogs
        if "discogs" in self.services:
            discogs_data = self._get_discogs_artist_data(artist)
            if discogs_data:
                artist.raw_data["discogs"] = discogs_data
                
                if discogs_data.get("url"):
                    artist.discogs_url = discogs_data["url"]
                
                # Add Discogs images if available
                if discogs_data.get("cover_image"):
                    discogs_image = Image(
                        url=discogs_data.get("cover_image", ""),
                        type="discogs_artist_primary"
                    )
                    artist.add_image(discogs_image)
                
                if discogs_data.get("thumb"):
                    discogs_thumb = Image(
                        url=discogs_data.get("thumb", ""),
                        type="discogs_artist_thumb"
                    )
                    artist.add_image(discogs_thumb)
            else:
                # If service was skipped, preserve existing Discogs data
                self.logger.info(f"Discogs data not updated, preserving existing data for {artist_name}")
        
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
            
            if self.interactive_mode:
                self.logger.info(f"🎵 Last.fm interactive mode: searching for artist {artist_name}")
                # Search for multiple artists first
                search_results = service.search_artist(artist_name)
                self.logger.info(f"🎵 Last.fm search completed, calling interactive selection")
                selected_match = self._interactive_select_artist_match("Last.fm", search_results, artist_name)
                if selected_match:
                    self.logger.info(f"🎵 Last.fm artist selected: {selected_match.get('name', 'Unknown')}")
                    # Get detailed info for the selected artist
                    return service.get_artist_detailed_info(selected_match.get("name", artist_name))
                else:
                    self.logger.info(f"🎵 Last.fm artist selection skipped")
                    return None
            else:
                self.logger.info(f"🎵 Last.fm non-interactive mode: getting artist info for {artist_name}")
                return service.get_artist_detailed_info(artist_name)
            
        except Exception as e:
            self.logger.warning(f"Failed to get Last.fm artist data for {artist_name}: {str(e)}")
            import traceback
            self.logger.warning(f"Last.fm error traceback: {traceback.format_exc()}")
        
        return None
    
    def _get_wikipedia_artist_data(self, artist_name: str) -> Optional[Any]:
        """Get Wikipedia data for an artist."""
        try:
            service = self.services["wikipedia"]
            
            if self.interactive_mode:
                # Search for multiple pages first
                search_results = service.search_artist(artist_name)
                selected_match = self._interactive_select_artist_match("Wikipedia", search_results, artist_name)
                if selected_match:
                    # Get detailed info for the selected page
                    page_title = selected_match.get("title", "")
                    if page_title:
                        page_info = service.get_page_info(page_title)
                        return service.create_wikipedia_enrichment(page_info, page_title)
                else:
                    return None
            else:
                # Use the existing non-interactive method
                artist_info = service.get_artist_info(artist_name)
                if artist_info:
                    return service.create_wikipedia_enrichment(artist_info)
                return None
            
        except Exception as e:
            self.logger.warning(f"Failed to get Wikipedia artist data for {artist_name}: {str(e)}")
        
        return None
    
    def _get_theaudiodb_artist_data(self, artist_name: str, musicbrainz_id: Optional[str] = None) -> Optional[ArtistTheAudioDBData]:
        """Get TheAudioDB data for an artist."""
        try:
            service = self.services["theaudiodb"]
            
            # Try MusicBrainz ID first if available
            if musicbrainz_id:
                self.logger.info(f"🎵 TheAudioDB: Searching by MusicBrainz ID: {musicbrainz_id}")
                artist_data = service.get_artist_by_musicbrainz_id(musicbrainz_id)
                if artist_data:
                    # Only get artist data, no albums or music videos
                    return service.create_artist_enrichment(artist_data, None, None)
            
            # Fall back to name search
            search_results = service.search_artist(artist_name)
            
            if self.interactive_mode:
                selected_match = self._interactive_select_artist_match("TheAudioDB", search_results, artist_name)
                if selected_match:
                    # Only get artist data, no albums or music videos
                    return service.create_artist_enrichment(selected_match, None, None)
            else:
                # Use first match
                if search_results:
                    best_match = search_results[0]
                    # Only get artist data, no albums or music videos
                    return service.create_artist_enrichment(best_match, None, None)
            
        except Exception as e:
            self.logger.warning(f"Failed to get TheAudioDB artist data for {artist_name}: {str(e)}")
        
        return None

    def _get_best_theaudiodb_biography(self, theaudiodb_data: ArtistTheAudioDBData) -> Optional[str]:
        """Get the best available biography from TheAudioDB data with language fallback priority."""
        # Priority order for biography languages
        language_priority = [
            'biography_en',      # English (highest priority)
            'biography_de',      # German
            'biography_fr',      # French
            'biography_es',      # Spanish
            'biography_it',      # Italian
            'biography_pt',      # Portuguese
            'biography_nl',      # Dutch
            'biography_se',      # Swedish
            'biography_ru',      # Russian
            'biography_jp'       # Japanese (lowest priority)
        ]
        
        # Try each language in priority order
        for lang_field in language_priority:
            biography = getattr(theaudiodb_data, lang_field, None)
            if biography and biography.strip():
                self.logger.info(f"Using TheAudioDB biography from {lang_field}")
                return biography.strip()
        
        self.logger.info("No TheAudioDB biography found in any language")
        return None

    def _get_discogs_artist_data(self, artist: Artist) -> Optional[Dict[str, Any]]:
        """Get Discogs data for an artist - first check cache, then fetch automatically."""
        try:
            self.logger.info(f"🔍 Getting Discogs data for artist: {artist.name}")
            self.logger.info(f"🔍 Artist discogs_id: {artist.discogs_id}")
            
            # If artist has a discogs_id, check for cached data first
            if artist.discogs_id:
                self.logger.info(f"✅ Using existing Discogs ID {artist.discogs_id} for artist: {artist.name}")
                
                # Check for pre-fetched cached data
                from pathlib import Path
                import json
                import subprocess
                
                cache_file = Path("discogs_cache") / f"artist_{artist.discogs_id}.json"
                if cache_file.exists():
                    try:
                        with open(cache_file, 'r', encoding='utf-8') as f:
                            cached_data = json.load(f)
                        
                        self.logger.info(f"✅ Found cached Discogs data for artist ID: {artist.discogs_id}")
                        self.logger.info(f"🔍 Cached data profile: {len(cached_data.get('profile', ''))} chars")
                        self.logger.info(f"🔍 Cached data images: {len(cached_data.get('images', []))} items")
                        
                        return cached_data
                        
                    except Exception as e:
                        self.logger.warning(f"⚠️ Failed to load cached Discogs data: {e}")
                
                # No cached data found, run the fetch script automatically
                self.logger.info(f"🚀 No cached data found, fetching Discogs data for artist ID: {artist.discogs_id}")
                try:
                    result = subprocess.run(
                        ["python", "fetch_discogs_artist.py", str(artist.discogs_id)],
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    
                    if result.returncode == 0:
                        self.logger.info(f"✅ Successfully fetched Discogs data for artist ID: {artist.discogs_id}")
                        
                        # Now try to load the cached data
                        if cache_file.exists():
                            try:
                                with open(cache_file, 'r', encoding='utf-8') as f:
                                    cached_data = json.load(f)
                                
                                self.logger.info(f"✅ Loaded fresh Discogs data for artist ID: {artist.discogs_id}")
                                self.logger.info(f"🔍 Fresh data profile: {len(cached_data.get('profile', ''))} chars")
                                self.logger.info(f"🔍 Fresh data images: {len(cached_data.get('images', []))} items")
                                
                                return cached_data
                                
                            except Exception as e:
                                self.logger.warning(f"⚠️ Failed to load fresh cached Discogs data: {e}")
                    else:
                        self.logger.warning(f"⚠️ Failed to fetch Discogs data: {result.stderr}")
                        
                except subprocess.TimeoutExpired:
                    self.logger.warning(f"⚠️ Timeout while fetching Discogs data for artist ID: {artist.discogs_id}")
                except Exception as e:
                    self.logger.warning(f"⚠️ Error running fetch script: {e}")
                
                # Return minimal data if fetch failed
                return {
                    "id": str(artist.discogs_id),
                    "name": artist.name,
                    "url": f"https://www.discogs.com/artist/{artist.discogs_id}",
                    "resource_url": f"https://api.discogs.com/artists/{artist.discogs_id}",
                    "profile": "",
                    "images": [],
                    "urls": [],
                    "namevariations": [],
                    "members": [],
                    "cover_image": "",
                    "thumb": "",
                    "raw_data": {
                        "id": artist.discogs_id,
                        "resource_url": f"https://api.discogs.com/artists/{artist.discogs_id}",
                        "note": f"Failed to fetch data automatically"
                    }
                }
            else:
                self.logger.info(f"❌ No discogs_id found for artist: {artist.name}")
                return None
            
        except Exception as e:
            self.logger.warning(f"Failed to get Discogs artist data for {artist.name}: {str(e)}")
        
        return None

    def _download_artist_images(self, artist: Artist) -> None:
        """Download artist images with priority: Apple Music (no /Music[digits]/) > Spotify > Discogs."""
        try:
            self.logger.info(f"🖼️ Starting image download process for artist: {artist.name}")
            
            # If custom image is provided, use it instead of extracted sources
            if self.custom_image:
                self.logger.info(f"🖼️ Using custom image URL: {self.custom_image}")
                # Add custom image as an image source
                custom_image = Image(
                    url=self.custom_image,
                    type="custom_artist_image",
                    width=2000,  # Assume high resolution
                    height=2000
                )
                artist.add_image(custom_image)
                
                # Download the custom image
                downloaded_images = self.image_manager.download_artist_images_with_fallback(
                    artist.name,
                    [{"type": "custom", "images": [{"url": self.custom_image, "type": "custom_artist_image"}]}]
                )
                
                if downloaded_images:
                    self.logger.info(f"🖼️ ✅ Downloaded custom image for {artist.name}")
                    artist.local_images = downloaded_images
                else:
                    self.logger.warning(f"🖼️ ❌ Failed to download custom image from {self.custom_image}")
                return
            
            # Extract image sources in priority order: Apple Music (no /Music[digits]/ pattern) > Spotify > Discogs
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
        """Extract artist image sources with configurable priority order."""
        sources = []
        
        self.logger.info(f"🔍 Extracting image sources for artist: {artist.name}")
        self.logger.info(f"📊 Available raw_data keys: {list(artist.raw_data.keys())}")
        
        # Check for preferred source override
        if self.preferred_image_source:
            self.logger.info(f"🎯 Using preferred image source: {self.preferred_image_source}")
            
            # Try preferred source first
            preferred_source = self._extract_source_by_type(artist, self.preferred_image_source)
            if preferred_source:
                sources.append(preferred_source)
            
            # Add fallback sources in default order (excluding the preferred one)
            default_order = ['apple_music', 'spotify', 'theaudiodb', 'discogs']
            for source_type in default_order:
                if source_type != self.preferred_image_source:
                    fallback_source = self._extract_source_by_type(artist, source_type)
                    if fallback_source:
                        sources.append(fallback_source)
        else:
            # Default priority order: Apple Music > Spotify > TheAudioDB > Discogs
            for source_type in ['apple_music', 'spotify', 'theaudiodb', 'discogs']:
                source = self._extract_source_by_type(artist, source_type)
                if source:
                    sources.append(source)
        
        self.logger.info(f"🏁 Final image sources priority order: {[s['type'] for s in sources]}")
        return sources
    
    def _extract_source_by_type(self, artist: Artist, source_type: str) -> Optional[Dict[str, Any]]:
        """Extract a specific source type."""
        if source_type == 'v1':
            # Handle v1 site images
            return self._extract_v1_source(artist)
        elif source_type == 'apple_music':
            return self._extract_apple_music_source(artist)
        elif source_type == 'spotify':
            return self._extract_spotify_source(artist)
        elif source_type == 'discogs':
            return self._extract_discogs_source(artist)
        elif source_type == 'theaudiodb':
            return self._extract_theaudiodb_source(artist)
        return None
    
    def _extract_v1_source(self, artist: Artist) -> Optional[Dict[str, Any]]:
        """Extract v1 site image source."""
        try:
            from .v1_site_helper import V1SiteHelper
            
            self.logger.info(f"🌐 Searching v1.russ.fm for artist images...")
            artist_images = V1SiteHelper.find_artist_images(artist.name)
            
            if artist_images:
                # Get the first matching artist image
                artist_key = list(artist_images.keys())[0]
                v1_image_url = artist_images[artist_key]
                
                self.logger.info(f"🌐 ✅ Found artist in v1 index: {artist_key}")
                self.logger.info(f"🌐 ✅ Using v1.russ.fm image: {v1_image_url}")
                
                v1_image = {
                    "url": v1_image_url,
                    "width": 2000,  # Assume high quality
                    "height": 2000,
                    "type": "v1_artist"
                }
                
                return {
                    "type": "v1",
                    "images": [v1_image]
                }
            else:
                self.logger.info(f"🌐 ❌ Artist '{artist.name}' not found in v1.russ.fm index")
                
        except Exception as e:
            self.logger.error(f"🌐 ❌ Error accessing v1.russ.fm data: {str(e)}")
        
        return None
    
    def _extract_apple_music_source(self, artist: Artist) -> Optional[Dict[str, Any]]:
        """Extract Apple Music image source (filtering out /Music[digits]/ URLs)."""
        if "apple_music" in artist.raw_data:
            apple_data = artist.raw_data["apple_music"]
            self.logger.info(f"🍎 Apple Music data found. Type: {type(apple_data)}")
            
            # Handle both object attributes and dictionary keys
            artwork_url = None
            if hasattr(apple_data, "artwork_url"):
                artwork_url = apple_data.artwork_url
            elif isinstance(apple_data, dict) and "artwork_url" in apple_data:
                artwork_url = apple_data["artwork_url"]
            
            self.logger.info(f"🍎 Apple Music artwork_url: {artwork_url}")
            
            if artwork_url:
                # Filter out images with /Music[digits]/ pattern
                import re
                if re.search(r'/Music\d+/', artwork_url):
                    self.logger.info(f"🍎 ❌ FILTERED OUT Apple Music URL (contains /Music[digits]/): {artwork_url}")
                    return None
                
                self.logger.info(f"🍎 ✅ KEEPING Apple Music URL: {artwork_url}")
                apple_image = {
                    "url": artwork_url,
                    "width": 2000,
                    "height": 2000,
                    "type": "apple_music_artist"
                }
                
                return {
                    "type": "apple_music",
                    "images": [apple_image]
                }
            else:
                self.logger.info(f"🍎 ❌ Apple Music artwork_url is empty or not found")
        else:
            self.logger.info(f"🍎 ❌ No Apple Music data found in raw_data")
        return None
    
    def _extract_spotify_source(self, artist: Artist) -> Optional[Dict[str, Any]]:
        """Extract Spotify image source."""
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
                return {
                    "type": "spotify",
                    "images": spotify_images
                }
            else:
                self.logger.info(f"🎵 ❌ Spotify data has no images")
        else:
            self.logger.info(f"🎵 ❌ No Spotify data found in raw_data")
        return None
    
    def _extract_discogs_source(self, artist: Artist) -> Optional[Dict[str, Any]]:
        """Extract Discogs image source."""
        if "discogs" in artist.raw_data:
            discogs_data = artist.raw_data["discogs"]
            self.logger.info(f"💿 Discogs data found. Type: {type(discogs_data)}")
            
            # Handle both object attributes and dictionary keys
            discogs_images = None
            if hasattr(discogs_data, "images") and discogs_data.images:
                discogs_images = discogs_data.images
            elif isinstance(discogs_data, dict) and "images" in discogs_data and discogs_data["images"]:
                discogs_images = discogs_data["images"]
            
            if discogs_images:
                self.logger.info(f"💿 ✅ Discogs images found: {len(discogs_images)} images")
                
                # Sort Discogs images by size (largest first) if size info is available
                if discogs_images and isinstance(discogs_images[0], dict):
                    try:
                        discogs_images = sorted(
                            discogs_images,
                            key=lambda x: (x.get("width", 0) * x.get("height", 0)),
                            reverse=True
                        )
                        self.logger.info(f"💿 ✅ Sorted Discogs images by size")
                    except (KeyError, TypeError, ValueError):
                        self.logger.info(f"💿 ⚠️ Could not sort Discogs images, using as-is")
                
                return {
                    "type": "discogs",
                    "images": discogs_images
                }
            else:
                self.logger.info(f"💿 ❌ Discogs data has no images")
        else:
            self.logger.info(f"💿 ❌ No Discogs data found in raw_data")
        return None
    
    def _extract_theaudiodb_source(self, artist: Artist) -> Optional[Dict[str, Any]]:
        """Extract TheAudioDB image source."""
        if "theaudiodb" in artist.raw_data:
            theaudiodb_data = artist.raw_data["theaudiodb"]
            self.logger.info(f"🎵 TheAudioDB data found. Type: {type(theaudiodb_data)}")
            
            # Handle both object attributes and dictionary keys
            theaudiodb_images = None
            if hasattr(theaudiodb_data, "images") and theaudiodb_data.images:
                theaudiodb_images = theaudiodb_data.images
                self.logger.info(f"🎵 Found images as object attribute")
            elif isinstance(theaudiodb_data, dict) and "images" in theaudiodb_data and theaudiodb_data["images"]:
                theaudiodb_images = theaudiodb_data["images"]
                self.logger.info(f"🎵 Found images as dictionary key")
            
            if theaudiodb_images:
                # Convert Image objects to dictionaries if needed
                images_list = []
                for img in theaudiodb_images:
                    if hasattr(img, "url"):
                        # It's an Image object
                        images_list.append({
                            "url": img.url,
                            "type": img.type,
                            "width": getattr(img, "width", 1000),
                            "height": getattr(img, "height", 1000)
                        })
                    elif isinstance(img, dict):
                        # It's already a dictionary
                        images_list.append(img)
                
                if images_list:
                    self.logger.info(f"🎵 ✅ TheAudioDB images found: {len(images_list)} images")
                    return {
                        "type": "theaudiodb",
                        "images": images_list
                    }
            else:
                self.logger.info(f"🎵 ❌ TheAudioDB data has no images")
        else:
            self.logger.info(f"🎵 ❌ No TheAudioDB data found in raw_data")
        return None
    
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
                artist_id = artist.get("id", "")
                # Construct proper Apple Music URL format: https://music.apple.com/{storefront}/artist/{artist_id}
                # Get storefront from Apple Music service if available
                storefront = "gb"  # Default to GB
                if "apple_music" in self.services:
                    storefront = getattr(self.services["apple_music"], "storefront", "gb")
                apple_music_url = f"https://music.apple.com/{storefront}/artist/{artist_id}" if artist_id else ""
                candidates.append({
                    "data": artist,
                    "name": attrs.get("name", "Unknown"),
                    "genres": ", ".join(attrs.get("genreNames", [])[:3]),  # Show first 3 genres
                    "url": apple_music_url,
                    "id": artist.get("id", "Unknown")
                })
        elif service_name == "Spotify":
            artists = search_results.get("artists", {}).get("items", [])
            for artist in artists:
                external_urls = artist.get("external_urls", {})
                spotify_url = external_urls.get("spotify", "")
                # If no external URL, construct from artist ID
                if not spotify_url:
                    artist_id = artist.get("id", "")
                    if artist_id:
                        spotify_url = f"https://open.spotify.com/artist/{artist_id}"
                candidates.append({
                    "data": artist,
                    "name": artist.get("name", "Unknown"),
                    "genres": ", ".join(artist.get("genres", [])[:3]),  # Show first 3 genres
                    "followers": f"{artist.get('followers', {}).get('total', 0):,}",
                    "popularity": str(artist.get("popularity", 0)),
                    "id": artist.get("id", "Unknown"),
                    "url": spotify_url
                })
        elif service_name == "Last.fm":
            # Last.fm search results structure
            artists = search_results.get("results", {}).get("artistmatches", {}).get("artist", [])
            for artist in artists:
                # Safe formatting for listeners count
                listeners_count = artist.get('listeners', 0)
                try:
                    listeners_formatted = f"{int(listeners_count):,}" if listeners_count else "0"
                except (ValueError, TypeError):
                    listeners_formatted = str(listeners_count) if listeners_count else "0"
                
                candidates.append({
                    "data": artist,
                    "name": artist.get("name", "Unknown"),
                    "listeners": listeners_formatted,
                    "url": artist.get("url", ""),
                    "mbid": artist.get("mbid", "Unknown")
                })
        elif service_name == "Wikipedia":
            # Wikipedia search results structure
            pages = search_results.get("query", {}).get("search", [])
            for page in pages:
                # Construct Wikipedia URL
                page_title = page.get("title", "")
                wiki_url = f"https://en.wikipedia.org/wiki/{page_title.replace(' ', '_')}" if page_title else ""
                candidates.append({
                    "data": page,
                    "title": page.get("title", "Unknown"),
                    "snippet": page.get("snippet", "").replace("<span class=\"searchmatch\">", "").replace("</span>", "")[:100] + "..." if len(page.get("snippet", "")) > 100 else page.get("snippet", "").replace("<span class=\"searchmatch\">", "").replace("</span>", ""),
                    "size": f"{page.get('size', 0):,} bytes" if page.get('size') else "Unknown size",
                    "url": wiki_url
                })
        elif service_name == "Discogs":
            # Discogs search results structure
            results = search_results.get("results", [])
            for result in results:
                artist_id = result.get("id", "")
                discogs_url = f"https://www.discogs.com/artist/{artist_id}" if artist_id else ""
                candidates.append({
                    "data": result,
                    "name": result.get("title", "Unknown"),
                    "type": result.get("type", "Unknown"),
                    "id": str(artist_id),
                    "url": discogs_url
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
            table.add_column("URL", style="blue")
        elif service_name == "Spotify":
            table.add_column("Genres", style="green")
            table.add_column("Followers", style="yellow")
            table.add_column("Popularity", style="blue")
            table.add_column("URL", style="cyan")
        elif service_name == "Last.fm":
            table.add_column("Listeners", style="green")
            table.add_column("MBID", style="yellow")
            table.add_column("URL", style="blue")
        elif service_name == "Wikipedia":
            table.add_column("Description", style="green")
            table.add_column("Size", style="yellow")
            table.add_column("URL", style="blue")
        elif service_name == "Discogs":
            table.add_column("Type", style="green")
            table.add_column("ID", style="yellow")
            table.add_column("URL", style="blue")
        
        for i, candidate in enumerate(candidates, 1):
            if service_name == "Apple Music":
                table.add_row(
                    str(i),
                    candidate["name"],
                    candidate["genres"] or "No genres",
                    candidate["id"],
                    candidate["url"]
                )
            elif service_name == "Spotify":
                table.add_row(
                    str(i),
                    candidate["name"],
                    candidate["genres"] or "No genres",
                    candidate["followers"],
                    candidate["popularity"],
                    candidate["url"]
                )
            elif service_name == "Last.fm":
                table.add_row(
                    str(i),
                    candidate["name"],
                    candidate["listeners"],
                    candidate["mbid"],
                    candidate["url"]
                )
            elif service_name == "Wikipedia":
                table.add_row(
                    str(i),
                    candidate["title"],
                    candidate["snippet"],
                    candidate["size"],
                    candidate["url"]
                )
            elif service_name == "Discogs":
                table.add_row(
                    str(i),
                    candidate["name"],
                    candidate["type"],
                    candidate["id"],
                    candidate["url"]
                )
        
        # Add skip option with appropriate number of columns
        if service_name == "Apple Music":
            table.add_row("0", "[dim]Skip this service[/dim]", "", "", "")
        elif service_name == "Spotify":
            table.add_row("0", "[dim]Skip this service[/dim]", "", "", "", "")
        elif service_name == "Last.fm":
            table.add_row("0", "[dim]Skip this service[/dim]", "", "", "")
        elif service_name == "Wikipedia":
            table.add_row("0", "[dim]Skip this service[/dim]", "", "", "")
        elif service_name == "Discogs":
            table.add_row("0", "[dim]Skip this service[/dim]", "", "", "")
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
    
    def get_artist_releases_from_db(self, discogs_artist_id: str) -> List[str]:
        """Get all known releases for an artist from the database."""
        if not discogs_artist_id:
            return []
        
        try:
            # Query releases table for this artist
            query = """
                SELECT DISTINCT title 
                FROM releases 
                WHERE artists LIKE ? 
                ORDER BY title
            """
            
            cursor = self.db_manager.conn.cursor()
            cursor.execute(query, [f'%"discogs_id": "{discogs_artist_id}"%'])
            releases = [row[0] for row in cursor.fetchall()]
            
            self.logger.info(f"Found {len(releases)} releases for artist {discogs_artist_id}")
            return releases
            
        except Exception as e:
            self.logger.error(f"Error getting releases for artist {discogs_artist_id}: {e}")
            return []
    
    def verify_artist_with_releases(self, artist: Artist, service_name: str, service_releases: List[str]) -> Dict[str, Any]:
        """Verify an artist by comparing their releases with service releases."""
        if not artist.discogs_id:
            return {
                'matches': [],
                'confidence_score': 0.0,
                'confidence_level': 'LOW',
                'error': 'No Discogs ID available'
            }
        
        # Get known releases from database
        known_releases = self.get_artist_releases_from_db(artist.discogs_id)
        
        if not known_releases:
            return {
                'matches': [],
                'confidence_score': 0.0,
                'confidence_level': 'LOW',
                'error': 'No releases found in database'
            }
        
        # Match releases
        matches = ReleaseVerifier.match_releases(known_releases, service_releases)
        confidence_score, confidence_level = ReleaseVerifier.calculate_confidence(matches, len(known_releases))
        
        self.logger.info(f"Release verification for {artist.name} on {service_name}: "
                        f"{len(matches)}/{len(known_releases)} matches, "
                        f"confidence: {confidence_level} ({confidence_score:.2f})")
        
        return {
            'matches': matches,
            'confidence_score': confidence_score,
            'confidence_level': confidence_level,
            'total_known_releases': len(known_releases),
            'total_service_releases': len(service_releases),
            'match_percentage': len(matches) / len(known_releases) if known_releases else 0
        }
    
    def verify_apple_music_artist_with_releases(self, artist: Artist, apple_music_artist_id: str) -> Dict[str, Any]:
        """Verify Apple Music artist by comparing releases."""
        if "apple_music" not in self.services:
            return {'error': 'Apple Music service not available'}
        
        try:
            # Get Apple Music albums for this artist
            apple_service = self.services["apple_music"]
            albums = apple_service.get_artist_albums(apple_music_artist_id, limit=100)
            
            if not albums:
                return {'error': 'No albums found on Apple Music'}
            
            # Extract album titles
            album_titles = []
            for album in albums:
                attributes = album.get('attributes', {})
                title = attributes.get('name', '')
                if title:
                    album_titles.append(title)
            
            self.logger.info(f"Found {len(album_titles)} albums on Apple Music for artist {apple_music_artist_id}")
            
            # Verify using releases
            return self.verify_artist_with_releases(artist, "Apple Music", album_titles)
            
        except Exception as e:
            self.logger.error(f"Error verifying Apple Music artist {apple_music_artist_id}: {e}")
            return {'error': f'Apple Music verification failed: {str(e)}'}
    
    def verify_spotify_artist_with_releases(self, artist: Artist, spotify_artist_id: str) -> Dict[str, Any]:
        """Verify Spotify artist by comparing releases."""
        if "spotify" not in self.services:
            return {'error': 'Spotify service not available'}
        
        try:
            # Get Spotify albums for this artist
            spotify_service = self.services["spotify"]
            albums = spotify_service.get_artist_albums(spotify_artist_id, limit=50, include_groups='album')
            
            if not albums:
                return {'error': 'No albums found on Spotify'}
            
            # Extract album titles
            album_titles = [album.get('name', '') for album in albums if album.get('name')]
            
            self.logger.info(f"Found {len(album_titles)} albums on Spotify for artist {spotify_artist_id}")
            
            # Verify using releases
            return self.verify_artist_with_releases(artist, "Spotify", album_titles)
            
        except Exception as e:
            self.logger.error(f"Error verifying Spotify artist {spotify_artist_id}: {e}")
            return {'error': f'Spotify verification failed: {str(e)}'}


class ArtistImageManager(ImageManager):
    """Specialized image manager for artist photos."""
    
    def __init__(self, base_path: str = "data/artists", config: Dict[str, Any] = None):
        """Initialize ArtistImageManager with base path for storing artist images."""
        super().__init__(base_path)
        self.config = config or {}
        
        # Only download hi-res images (other sizes generated at build time)
        # Override image sizes to only use hi-res regardless of config
        if config and hasattr(config, 'get') and config.get("image_sizes") and "hi-res" in config.get("image_sizes", {}):
            # Only use hi-res from config
            hi_res_str = config.get("image_sizes", {}).get("hi-res", "2000x2000")
            if "x" in hi_res_str:
                width_str = hi_res_str.split("x")[0]
                hi_res_size = int(width_str)
            else:
                hi_res_size = int(hi_res_str)
            self.image_sizes = {"hi-res": hi_res_size}
        else:
            # Default to hi-res only
            self.image_sizes = {"hi-res": 2000}
    
    def create_artist_folder(self, artist_name: str) -> Path:
        """Create folder for artist with URL-safe name."""
        sanitized_name = self.sanitize_filename(artist_name)
        folder_path = self.base_path / sanitized_name
        folder_path.mkdir(exist_ok=True)
        return folder_path
    
    def download_artist_images(self, artist_name: str, artwork_url: str) -> Dict[str, Optional[Path]]:
        """Download artist images (only hi-res, other sizes generated at build time)."""
        if not artwork_url:
            logger.warning("No artwork URL provided for artist")
            return {}
        
        # Create artist folder
        artist_folder = self.create_artist_folder(artist_name)
        
        # Download only hi-res image (other sizes generated at build time)
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
                logger.info(f"Downloaded {size_name} artist image for {artist_name} (other sizes will be generated at build time)")
            else:
                downloaded_images[size_name] = None
                logger.warning(f"Failed to download {size_name} artist image for {artist_name}")
        
        return downloaded_images
    
    def download_artist_images_with_fallback(self, artist_name: str, image_sources: List[Dict[str, Any]]) -> Dict[str, Optional[Path]]:
        """Download artist images with fallback sources (only hi-res, other sizes generated at build time)."""
        if not image_sources:
            logger.warning("No image sources provided for artist")
            return {}
        
        # Create artist folder
        artist_folder = self.create_artist_folder(artist_name)
        
        # Download only hi-res images (other sizes generated at build time)
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
                elif source_type == "custom":
                    # Handle custom image source
                    if images and len(images) > 0:
                        custom_image = images[0]
                        if isinstance(custom_image, dict) and custom_image.get("url"):
                            sized_url = custom_image.get("url")
                        else:
                            continue
                    else:
                        continue
                elif source_type == "v1":
                    # Handle v1.russ.fm image source
                    if images and len(images) > 0:
                        v1_image = images[0]
                        if isinstance(v1_image, dict) and v1_image.get("url"):
                            sized_url = v1_image.get("url")
                        else:
                            continue
                    else:
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
                    logger.info(f"Downloaded {size_name} artist image for {artist_name} from {source_type} (other sizes will be generated at build time)")
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