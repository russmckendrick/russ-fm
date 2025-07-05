"""Last.fm API service implementation."""

import hashlib
from typing import Dict, Any, Optional, List

from ..base import BaseService, AuthenticationError
from ...models.enrichment import LastFmData, ArtistLastFmData
from ...utils.text_cleaner import clean_for_json


class LastFmService(BaseService):
    """Service for interacting with the Last.fm API."""
    
    BASE_URL = "https://ws.audioscrobbler.com/2.0"
    
    def __init__(self, config: Dict[str, Any], **kwargs):
        super().__init__(config, **kwargs)
        self.api_key = config.get("api_key")
        self.shared_secret = config.get("shared_secret")
        self.username = config.get("username")
        
        if not self.api_key:
            raise AuthenticationError("Last.fm API key is required")
    
    def authenticate(self) -> None:
        """Test authentication with Last.fm API."""
        # Test with a simple API call
        params = {
            "method": "chart.getTopTracks",
            "api_key": self.api_key,
            "format": "json",
            "limit": 1,
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        
        if response.status_code != 200:
            raise AuthenticationError("Failed to authenticate with Last.fm API")
        
        data = response.json()
        if "error" in data:
            raise AuthenticationError(f"Last.fm API error: {data['message']}")
        
        self.logger.info("Last.fm API authentication successful")
    
    def _sign_request(self, params: Dict[str, Any]) -> str:
        """Create API signature for authenticated requests."""
        if not self.shared_secret:
            return ""
        
        # Sort parameters and create signature string
        sorted_params = sorted(params.items())
        signature_string = "".join(f"{k}{v}" for k, v in sorted_params)
        signature_string += self.shared_secret
        
        # Create MD5 hash
        return hashlib.md5(signature_string.encode()).hexdigest()
    
    def search_release(self, artist: str, album: str, **kwargs) -> Dict[str, Any]:
        """Search for a release on Last.fm."""
        params = {
            "method": "album.search",
            "album": f"{artist} {album}",
            "api_key": self.api_key,
            "format": "json",
            "limit": 30,
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def get_release_details(self, release_id: str) -> Dict[str, Any]:
        """Get detailed information about a release (using artist/album)."""
        # Last.fm doesn't use IDs like other services
        # This would need artist and album name
        raise NotImplementedError("Use get_album_info with artist and album name")
    
    def get_album_info(self, artist: str, album: str, mbid: Optional[str] = None) -> Dict[str, Any]:
        """Get album information from Last.fm."""
        params = {
            "method": "album.getInfo",
            "artist": artist,
            "album": album,
            "api_key": self.api_key,
            "format": "json",
        }
        
        if mbid:
            params["mbid"] = mbid
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def get_artist_info(self, artist: str, mbid: Optional[str] = None) -> Dict[str, Any]:
        """Get artist information from Last.fm."""
        params = {
            "method": "artist.getInfo",
            "artist": artist,
            "api_key": self.api_key,
            "format": "json",
        }
        
        if mbid:
            params["mbid"] = mbid
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def get_artist_top_albums(self, artist: str, limit: int = 10) -> Dict[str, Any]:
        """Get top albums for an artist."""
        params = {
            "method": "artist.getTopAlbums",
            "artist": artist,
            "api_key": self.api_key,
            "format": "json",
            "limit": limit,
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def get_artist_similar(self, artist: str, limit: int = 10) -> Dict[str, Any]:
        """Get similar artists."""
        params = {
            "method": "artist.getSimilar",
            "artist": artist,
            "api_key": self.api_key,
            "format": "json",
            "limit": limit,
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def get_artist_top_tracks(self, artist: str, limit: int = 10) -> Dict[str, Any]:
        """Get top tracks for an artist."""
        params = {
            "method": "artist.getTopTracks",
            "artist": artist,
            "api_key": self.api_key,
            "format": "json",
            "limit": limit,
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def get_album_top_tags(self, artist: str, album: str) -> Dict[str, Any]:
        """Get top tags for an album."""
        params = {
            "method": "album.getTopTags",
            "artist": artist,
            "album": album,
            "api_key": self.api_key,
            "format": "json",
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def get_artist_tags(self, artist: str) -> Dict[str, Any]:
        """Get tags for an artist."""
        params = {
            "method": "artist.getTopTags",
            "artist": artist,
            "api_key": self.api_key,
            "format": "json",
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def search_artist(self, artist: str, limit: int = 30) -> Dict[str, Any]:
        """Search for artists."""
        params = {
            "method": "artist.search",
            "artist": artist,
            "api_key": self.api_key,
            "format": "json",
            "limit": limit,
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def create_lastfm_enrichment(self, lastfm_data: Dict[str, Any], data_type: str = "album") -> LastFmData:
        """Create LastFmData enrichment from raw data."""
        if data_type == "album":
            return self._create_album_enrichment(lastfm_data)
        elif data_type == "artist":
            return self._create_artist_enrichment(lastfm_data)
        else:
            return LastFmData(raw_data=lastfm_data)
    
    def _create_album_enrichment(self, album_data: Dict[str, Any]) -> LastFmData:
        """Create enrichment from album data."""
        album_info = album_data.get("album", {})
        
        # Extract tags
        tags = []
        tag_data = album_info.get("tags", {}).get("tag", [])
        if isinstance(tag_data, list):
            tags = [tag.get("name", "") for tag in tag_data]
        elif isinstance(tag_data, dict):
            tags = [tag_data.get("name", "")]
        
        # Extract wiki information and clean it for JSON
        wiki_summary = ""
        wiki_content = ""
        wiki_data = album_info.get("wiki", {})
        if wiki_data:
            wiki_summary = clean_for_json(wiki_data.get("summary", ""))
            wiki_content = clean_for_json(wiki_data.get("content", ""))
        
        # Extract images
        images = []
        image_data = album_info.get("image", [])
        if isinstance(image_data, list):
            images = [{"size": img.get("size", ""), "url": img.get("#text", "")} for img in image_data]
        
        return LastFmData(
            mbid=album_info.get("mbid"),
            url=album_info.get("url"),
            playcount=int(album_info.get("playcount", 0)) if album_info.get("playcount") else None,
            listeners=int(album_info.get("listeners", 0)) if album_info.get("listeners") else None,
            tags=tags,
            wiki_summary=wiki_summary,
            wiki_content=wiki_content,
            images=images,
            raw_data=album_data,
        )
    
    def _create_artist_enrichment(self, artist_data: Dict[str, Any]) -> LastFmData:
        """Create enrichment from artist data."""
        artist_info = artist_data.get("artist", {})
        
        # Extract tags
        tags = []
        tag_data = artist_info.get("tags", {}).get("tag", [])
        if isinstance(tag_data, list):
            tags = [tag.get("name", "") for tag in tag_data]
        elif isinstance(tag_data, dict):
            tags = [tag_data.get("name", "")]
        
        # Extract similar artists
        similar_artists = []
        similar_data = artist_info.get("similar", {}).get("artist", [])
        if isinstance(similar_data, list):
            similar_artists = [artist.get("name", "") for artist in similar_data]
        elif isinstance(similar_data, dict):
            similar_artists = [similar_data.get("name", "")]
        
        # Get bio and clean it for JSON
        bio = ""
        wiki_summary = ""
        wiki_content = ""
        bio_data = artist_info.get("bio", {})
        if bio_data:
            bio = clean_for_json(bio_data.get("summary", "") or bio_data.get("content", ""))
            wiki_summary = clean_for_json(bio_data.get("summary", ""))
            wiki_content = clean_for_json(bio_data.get("content", ""))
        
        # Extract images
        images = []
        image_data = artist_info.get("image", [])
        if isinstance(image_data, list):
            images = [{"size": img.get("size", ""), "url": img.get("#text", "")} for img in image_data]
        
        return LastFmData(
            mbid=artist_info.get("mbid"),
            url=artist_info.get("url"),
            playcount=int(artist_info.get("playcount", 0)) if artist_info.get("playcount") else None,
            listeners=int(artist_info.get("listeners", 0)) if artist_info.get("listeners") else None,
            tags=tags,
            similar_artists=similar_artists,
            bio=bio,
            wiki_summary=wiki_summary,
            wiki_content=wiki_content,
            images=images,
            raw_data=artist_data,
        )
    
    def find_best_album_match(self, artist: str, album: str) -> Optional[LastFmData]:
        """Find the best Last.fm match for an album."""
        try:
            album_info = self.get_album_info(artist, album)
            
            if "error" in album_info:
                return None
            
            return self.create_lastfm_enrichment(album_info, "album")
        except Exception as e:
            self.logger.warning(f"Failed to get Last.fm album info: {str(e)}")
            return None
    
    def find_best_artist_match(self, artist: str) -> Optional[LastFmData]:
        """Find the best Last.fm match for an artist."""
        try:
            artist_info = self.get_artist_info(artist)
            
            if "error" in artist_info:
                return None
            
            return self.create_lastfm_enrichment(artist_info, "artist")
        except Exception as e:
            self.logger.warning(f"Failed to get Last.fm artist info: {str(e)}")
            return None
    
    # Comprehensive artist methods
    
    def get_artist_detailed_info(self, artist: str) -> Optional[ArtistLastFmData]:
        """Get comprehensive artist information from Last.fm."""
        try:
            artist_info = self.get_artist_info(artist)
            
            if "error" in artist_info:
                return None
            
            return self.create_artist_enrichment(artist_info)
        except Exception as e:
            self.logger.warning(f"Failed to get Last.fm artist detailed info: {str(e)}")
            return None
    
    def get_artist_top_albums(self, artist: str, limit: int = 10) -> Dict[str, Any]:
        """Get artist's top albums from Last.fm."""
        params = {
            "method": "artist.gettopalbums",
            "artist": artist,
            "api_key": self.api_key,
            "format": "json",
            "limit": limit
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def get_artist_top_tracks(self, artist: str, limit: int = 10) -> Dict[str, Any]:
        """Get artist's top tracks from Last.fm."""
        params = {
            "method": "artist.gettoptracks",
            "artist": artist,
            "api_key": self.api_key,
            "format": "json",
            "limit": limit
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def get_similar_artists(self, artist: str, limit: int = 10) -> Dict[str, Any]:
        """Get similar artists from Last.fm."""
        params = {
            "method": "artist.getsimilar",
            "artist": artist,
            "api_key": self.api_key,
            "format": "json",
            "limit": limit
        }
        
        response = self._make_request("GET", self.BASE_URL, params=params)
        return response.json()
    
    def create_artist_enrichment(self, artist_data: Dict[str, Any]) -> ArtistLastFmData:
        """Create ArtistLastFmData enrichment from raw data."""
        artist = artist_data.get("artist", {})
        
        # Extract bio information
        bio = artist.get("bio", {})
        bio_summary = clean_for_json(bio.get("summary", "")) if bio.get("summary") else None
        bio_content = clean_for_json(bio.get("content", "")) if bio.get("content") else None
        
        # Extract tags
        tags = []
        tags_data = artist.get("tags", {}).get("tag", [])
        if isinstance(tags_data, list):
            tags = [tag.get("name", "") for tag in tags_data]
        elif isinstance(tags_data, dict):
            tags = [tags_data.get("name", "")]
        
        # Extract images
        images = []
        images_data = artist.get("image", [])
        if isinstance(images_data, list):
            for img in images_data:
                if isinstance(img, dict):
                    images.append({
                        "size": img.get("size", ""),
                        "url": img.get("#text", "")
                    })
        
        # Extract similar artists
        similar_artists = []
        similar_data = artist.get("similar", {}).get("artist", [])
        if isinstance(similar_data, list):
            for similar in similar_data:
                if isinstance(similar, dict):
                    similar_artists.append({
                        "name": similar.get("name", ""),
                        "url": similar.get("url", "")
                    })
        
        # Extract statistics
        stats = artist.get("stats", {})
        listeners = None
        playcount = None
        
        if stats:
            try:
                listeners = int(stats.get("listeners", 0))
                playcount = int(stats.get("playcount", 0))
            except (ValueError, TypeError):
                pass
        
        return ArtistLastFmData(
            name=artist.get("name"),
            url=artist.get("url"),
            mbid=artist.get("mbid"),
            listeners=listeners,
            playcount=playcount,
            bio_summary=bio_summary,
            bio_content=bio_content,
            tags=tags,
            similar_artists=similar_artists,
            images=images,
            top_albums=[],  # Will be populated by separate calls if needed
            top_tracks=[],  # Will be populated by separate calls if needed
            raw_data=artist_data,
        )
    
