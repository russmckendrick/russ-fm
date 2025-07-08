import logging
from typing import Dict, List, Optional, Any
import requests
from urllib.parse import quote

from ..base import BaseService
from ...models.enrichment import ArtistTheAudioDBData
from ...models.release import Artist, Image

logger = logging.getLogger(__name__)


class TheAudioDBService(BaseService):
    def __init__(self, config: Dict[str, Any], **kwargs):
        super().__init__(config, **kwargs)
        self.api_token = config.get("TheAudioDB", {}).get("api_token", "2")
        self.base_url = config.get("TheAudioDB", {}).get("base_url", "https://theaudiodb.com/api/v1/json/")
        
    def authenticate(self) -> bool:
        """Test authentication with TheAudioDB API."""
        try:
            # Test with a known artist (Coldplay as per their example)
            test_url = f"{self.base_url}{self.api_token}/search.php?s=coldplay"
            response = self.session.get(test_url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data and "artists" in data:
                    self.logger.info("TheAudioDB authentication successful")
                    return True
            
            self.logger.error(f"TheAudioDB authentication failed: {response.status_code}")
            return False
            
        except Exception as e:
            self.logger.error(f"TheAudioDB authentication error: {str(e)}")
            return False
    
    def search_artist(self, artist_name: str) -> List[Dict[str, Any]]:
        """Search for an artist by name."""
        try:
            encoded_name = quote(artist_name)
            url = f"{self.base_url}{self.api_token}/search.php?s={encoded_name}"
            
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if data and "artists" in data and data["artists"]:
                return data["artists"]
            
            self.logger.info(f"No results found for artist: {artist_name}")
            return []
            
        except Exception as e:
            self.logger.error(f"Error searching for artist {artist_name}: {str(e)}")
            return []
    
    def get_artist_by_id(self, artist_id: str) -> Optional[Dict[str, Any]]:
        """Get artist details by TheAudioDB ID."""
        try:
            url = f"{self.base_url}{self.api_token}/artist.php?i={artist_id}"
            
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if data and "artists" in data and data["artists"]:
                return data["artists"][0]
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting artist by ID {artist_id}: {str(e)}")
            return None
    
    def get_artist_by_musicbrainz_id(self, mb_id: str) -> Optional[Dict[str, Any]]:
        """Get artist details by MusicBrainz ID."""
        try:
            url = f"{self.base_url}{self.api_token}/artist-mb.php?i={mb_id}"
            
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if data and "artists" in data and data["artists"]:
                return data["artists"][0]
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting artist by MusicBrainz ID {mb_id}: {str(e)}")
            return None
    
    def get_artist_albums(self, artist_id: str) -> List[Dict[str, Any]]:
        """Get all albums for an artist."""
        try:
            url = f"{self.base_url}{self.api_token}/album.php?i={artist_id}"
            
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if data and "album" in data and data["album"]:
                return data["album"]
            
            return []
            
        except Exception as e:
            self.logger.error(f"Error getting albums for artist {artist_id}: {str(e)}")
            return []
    
    def get_artist_mvids(self, artist_id: str) -> List[Dict[str, Any]]:
        """Get music videos for an artist."""
        try:
            url = f"{self.base_url}{self.api_token}/mvid.php?i={artist_id}"
            
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if data and "mvids" in data and data["mvids"]:
                return data["mvids"]
            
            return []
            
        except Exception as e:
            self.logger.error(f"Error getting music videos for artist {artist_id}: {str(e)}")
            return []
    
    def create_artist_enrichment(self, artist_data: Dict[str, Any], 
                               albums_data: Optional[List[Dict[str, Any]]] = None,
                               mvids_data: Optional[List[Dict[str, Any]]] = None) -> Optional[ArtistTheAudioDBData]:
        """Create ArtistTheAudioDBData enrichment object from API data."""
        try:
            if not artist_data:
                return None
            
            # Extract artist images
            images = []
            
            # Artist thumb images
            for i in range(1, 11):  # strArtistThumb1 through strArtistThumb10
                thumb_key = f"strArtistThumb{i}" if i > 1 else "strArtistThumb"
                if artist_data.get(thumb_key):
                    images.append(Image(
                        url=artist_data[thumb_key],
                        type="artist",
                        width=1000,
                        height=1000
                    ))
            
            # Artist fanart images
            for i in range(1, 5):  # strArtistFanart1 through strArtistFanart4
                fanart_key = f"strArtistFanart{i}"
                if artist_data.get(fanart_key):
                    images.append(Image(
                        url=artist_data[fanart_key],
                        type="fanart",
                        width=1920,
                        height=1080
                    ))
            
            # Artist banner
            if artist_data.get("strArtistBanner"):
                images.append(Image(
                    url=artist_data["strArtistBanner"],
                    type="banner",
                    width=1000,
                    height=185
                ))
            
            # Artist logo/clearart
            if artist_data.get("strArtistLogo"):
                images.append(Image(
                    url=artist_data["strArtistLogo"],
                    type="logo",
                    width=400,
                    height=155
                ))
            
            if artist_data.get("strArtistClearart"):
                images.append(Image(
                    url=artist_data["strArtistClearart"],
                    type="clearart", 
                    width=1000,
                    height=1000
                ))
            
            # Create enrichment data
            enrichment = ArtistTheAudioDBData(
                id=artist_data.get("idArtist"),
                name=artist_data.get("strArtist"),
                alternate_names=artist_data.get("strArtistAlternate"),
                formed_year=artist_data.get("intFormedYear"),
                born_year=artist_data.get("intBornYear"),
                died_year=artist_data.get("intDiedYear"),
                disbanded=artist_data.get("strDisbanded") == "Yes",
                style=artist_data.get("strStyle"),
                genre=artist_data.get("strGenre"),
                mood=artist_data.get("strMood"),
                website=artist_data.get("strWebsite"),
                facebook=artist_data.get("strFacebook"),
                twitter=artist_data.get("strTwitter"),
                biography_en=artist_data.get("strBiographyEN"),
                biography_de=artist_data.get("strBiographyDE"),
                biography_fr=artist_data.get("strBiographyFR"),
                biography_it=artist_data.get("strBiographyIT"),
                biography_es=artist_data.get("strBiographyES"),
                biography_pt=artist_data.get("strBiographyPT"),
                biography_se=artist_data.get("strBiographySE"),
                biography_nl=artist_data.get("strBiographyNL"),
                biography_ru=artist_data.get("strBiographyRU"),
                biography_jp=artist_data.get("strBiographyJP"),
                gender=artist_data.get("strGender"),
                members=artist_data.get("intMembers"),
                country=artist_data.get("strCountry"),
                country_code=artist_data.get("strCountryCode"),
                musicbrainz_id=artist_data.get("strMusicBrainzID"),
                last_fm_chart=artist_data.get("strLastFMChart"),
                images=images,
                albums=albums_data,
                music_videos=mvids_data
            )
            
            return enrichment
            
        except Exception as e:
            self.logger.error(f"Error creating artist enrichment: {str(e)}")
            return None
    
    def search_release(self, artist: str, album: str = None) -> List[Dict[str, Any]]:
        """Search for albums - implementing base class method."""
        if not album:
            # Search all albums by artist
            artists = self.search_artist(artist)
            if artists:
                artist_id = artists[0].get("idArtist")
                return self.get_artist_albums(artist_id)
        else:
            # Search specific album
            try:
                encoded_artist = quote(artist)
                encoded_album = quote(album)
                url = f"{self.base_url}{self.api_token}/searchalbum.php?s={encoded_artist}&a={encoded_album}"
                
                response = self.session.get(url, timeout=10)
                response.raise_for_status()
                
                data = response.json()
                if data and "album" in data and data["album"]:
                    return data["album"]
                    
            except Exception as e:
                self.logger.error(f"Error searching for album {album} by {artist}: {str(e)}")
        
        return []
    
    def get_release_details(self, release_id: str) -> Optional[Dict[str, Any]]:
        """Get album details - implementing base class method."""
        try:
            url = f"{self.base_url}{self.api_token}/album.php?m={release_id}"
            
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if data and "album" in data and data["album"]:
                return data["album"][0]
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting album details for {release_id}: {str(e)}")
            return None