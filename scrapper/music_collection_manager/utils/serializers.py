"""Centralized serialization utilities for consistent data handling across JSON and database storage."""

import json
from typing import Any, Dict, Optional
from datetime import datetime
from pathlib import Path

from ..models import Release, Artist, Track, Image
from ..models.enrichment import AppleMusicData, SpotifyData, LastFmData, WikipediaData


class ReleaseSerializer:
    """Centralized serializer for Release objects to ensure consistency between JSON and database storage."""
    
    @staticmethod
    def to_dict(release: Release, include_enrichment: bool = True) -> Dict[str, Any]:
        """
        Convert Release to a comprehensive dictionary.
        
        Args:
            release: Release object to serialize
            include_enrichment: Whether to include enriched service data
            
        Returns:
            Dictionary representation of the release
        """
        data = {
            'id': release.id,
            'title': release.title,
            'discogs_id': release.discogs_id,
            'year': release.year,
            'released': release.released,
            'country': release.country,
            'formats': release.formats,
            'labels': release.labels,
            'genres': release.genres,
            'styles': release.styles,
            
            # Service-specific release names
            'release_name_discogs': release.release_name_discogs,
            'release_name_apple_music': release.release_name_apple_music,
            'release_name_spotify': release.release_name_spotify,
            
            # External IDs
            'apple_music_id': release.apple_music_id,
            'spotify_id': release.spotify_id,
            'lastfm_mbid': release.lastfm_mbid,
            
            # URLs
            'discogs_url': release.discogs_url,
            'apple_music_url': release.apple_music_url,
            'spotify_url': release.spotify_url,
            'lastfm_url': release.lastfm_url,
            
            # Metadata
            'created_at': release.created_at.isoformat() if release.created_at else None,
            'updated_at': release.updated_at.isoformat() if release.updated_at else None,
            'date_added': release.date_added.isoformat() if release.date_added else None,
            
            # Structured data
            'artists': [ReleaseSerializer._serialize_artist(artist) for artist in release.artists],
            'images': [ReleaseSerializer._serialize_image(image) for image in release.images],
            'tracklist': [ReleaseSerializer._serialize_track(track) for track in release.tracklist],
            
            # Local images if available
            'local_images': {}
        }
        
        # Add local images if available
        if hasattr(release, 'local_images') and release.local_images:
            data['local_images'] = {
                size: str(path) if path else None
                for size, path in release.local_images.items()
            }
        
        # Add enrichment data if requested
        if include_enrichment:
            data['services'] = ReleaseSerializer._serialize_enrichment_data(release)
            data['artists_wikipedia'] = ReleaseSerializer._serialize_artist_wikipedia(release)
            data['processing_info'] = ReleaseSerializer._serialize_processing_info(release)
        
        return data
    
    @staticmethod
    def _serialize_artist(artist: Artist) -> Dict[str, Any]:
        """Serialize an Artist object."""
        data = {
            'id': artist.id,
            'name': artist.name,
            'role': artist.role,
            'biography': artist.biography,
            'discogs_id': artist.discogs_id,
            'apple_music_id': artist.apple_music_id,
            'spotify_id': artist.spotify_id,
            'lastfm_mbid': artist.lastfm_mbid,
            'wikipedia_url': artist.wikipedia_url,
        }
        
        # Include raw_data if it contains discogs info
        if hasattr(artist, 'raw_data') and 'discogs' in artist.raw_data:
            data['discogs_original_name'] = artist.raw_data['discogs'].get('original_name', artist.name)
        
        return data
    
    @staticmethod
    def _serialize_image(image: Image) -> Dict[str, Any]:
        """Serialize an Image object."""
        return {
            'url': image.url,
            'type': image.type,
            'width': image.width,
            'height': image.height,
            'resource_url': image.resource_url,
        }
    
    @staticmethod
    def _serialize_track(track: Track) -> Dict[str, Any]:
        """Serialize a Track object."""
        return {
            'position': track.position,
            'title': track.title,
            'duration': track.duration,
            'artists': [ReleaseSerializer._serialize_artist(artist) for artist in track.artists],
        }
    
    @staticmethod
    def _serialize_enrichment_data(release: Release) -> Dict[str, Any]:
        """Serialize enrichment data from all services."""
        services = {}
        
        if hasattr(release, 'raw_data') and release.raw_data:
            # Apple Music data
            if 'apple_music' in release.raw_data:
                apple_data = release.raw_data['apple_music']
                services['apple_music'] = ReleaseSerializer._serialize_apple_music_data(apple_data)
            
            # Spotify data
            if 'spotify' in release.raw_data:
                spotify_data = release.raw_data['spotify']
                services['spotify'] = ReleaseSerializer._serialize_spotify_data(spotify_data)
            
            # Last.fm data
            if 'lastfm' in release.raw_data:
                lastfm_data = release.raw_data['lastfm']
                services['lastfm'] = ReleaseSerializer._serialize_lastfm_data(lastfm_data)
        
        return services
    
    @staticmethod
    def _serialize_apple_music_data(apple_data: Any) -> Dict[str, Any]:
        """Serialize Apple Music data."""
        if hasattr(apple_data, '__dict__'):
            return {
                'id': getattr(apple_data, 'id', None),
                'url': getattr(apple_data, 'url', None),
                'artwork_url': getattr(apple_data, 'artwork_url', None),
                'preview_url': getattr(apple_data, 'preview_url', None),
                'copyright': getattr(apple_data, 'copyright', None),
                'editorial_notes': getattr(apple_data, 'editorial_notes', None),
                'is_complete': getattr(apple_data, 'is_complete', False),
                'content_rating': getattr(apple_data, 'content_rating', None),
                'raw_attributes': getattr(apple_data, 'raw_data', {}).get('attributes', {}) if hasattr(apple_data, 'raw_data') else {}
            }
        return apple_data if isinstance(apple_data, dict) else {}
    
    @staticmethod
    def _serialize_spotify_data(spotify_data: Any) -> Dict[str, Any]:
        """Serialize Spotify data."""
        if hasattr(spotify_data, '__dict__'):
            return {
                'id': getattr(spotify_data, 'id', None),
                'url': getattr(spotify_data, 'url', None),
                'preview_url': getattr(spotify_data, 'preview_url', None),
                'popularity': getattr(spotify_data, 'popularity', None),
                'explicit': getattr(spotify_data, 'explicit', None),
                'album_type': getattr(spotify_data, 'album_type', None),
                'total_tracks': getattr(spotify_data, 'total_tracks', None),
                'release_date': getattr(spotify_data, 'release_date', None),
                'release_date_precision': getattr(spotify_data, 'release_date_precision', None),
                'available_markets': getattr(spotify_data, 'available_markets', []),
                'external_ids': getattr(spotify_data, 'external_ids', {}),
                'images': getattr(spotify_data, 'images', []),
                'label': getattr(spotify_data, 'label', None),
                'copyrights': getattr(spotify_data, 'copyrights', []),
                'tracks': getattr(spotify_data, 'tracks', []),
                'raw_data': getattr(spotify_data, 'raw_data', {}) if getattr(spotify_data, 'raw_data', {}) else {}
            }
        return spotify_data if isinstance(spotify_data, dict) else {}
    
    @staticmethod
    def _serialize_lastfm_data(lastfm_data: Any) -> Dict[str, Any]:
        """Serialize Last.fm data."""
        if hasattr(lastfm_data, '__dict__'):
            return {
                'url': getattr(lastfm_data, 'url', None),
                'mbid': getattr(lastfm_data, 'mbid', None),
                'listeners': getattr(lastfm_data, 'listeners', None),
                'playcount': getattr(lastfm_data, 'playcount', None),
                'tags': getattr(lastfm_data, 'tags', []),
                'wiki_summary': getattr(lastfm_data, 'wiki_summary', None),
                'wiki_content': getattr(lastfm_data, 'wiki_content', None),
                'images': getattr(lastfm_data, 'images', []),
                'similar_artists': getattr(lastfm_data, 'similar_artists', []),
                'top_tracks': getattr(lastfm_data, 'top_tracks', []),
                'top_albums': getattr(lastfm_data, 'top_albums', []),
                'raw_data': getattr(lastfm_data, 'raw_data', {}) if getattr(lastfm_data, 'raw_data', {}) else {}
            }
        return lastfm_data if isinstance(lastfm_data, dict) else {}
    
    @staticmethod
    def _serialize_artist_wikipedia(release: Release) -> Dict[str, Dict[str, Any]]:
        """Serialize Wikipedia data for artists."""
        wikipedia_data = {}
        for artist in release.artists:
            if artist.wikipedia_url or artist.biography:
                wikipedia_data[artist.name] = {
                    'wikipedia_url': artist.wikipedia_url,
                    'biography': artist.biography
                }
        return wikipedia_data
    
    @staticmethod
    def _serialize_processing_info(release: Release) -> Dict[str, Any]:
        """Serialize processing metadata."""
        # Determine which services were used based on available data
        services_used = []
        if release.discogs_id:
            services_used.append('discogs')
        if release.apple_music_id:
            services_used.append('apple_music')
        if release.spotify_id:
            services_used.append('spotify')
        if release.lastfm_mbid:
            services_used.append('lastfm')
        # Check for Wikipedia data in artists
        if any(artist.wikipedia_url or artist.biography for artist in release.artists):
            services_used.append('wikipedia')
            
        return {
            'processed_at': datetime.now().isoformat(),
            'services_used': services_used,
            'has_local_images': bool(getattr(release, 'local_images', {})),
            'local_images_count': len([path for path in getattr(release, 'local_images', {}).values() if path])
        }
    
    @staticmethod
    def to_json(release: Release, include_enrichment: bool = True, **kwargs) -> str:
        """
        Convert Release to JSON string.
        
        Args:
            release: Release object to serialize
            include_enrichment: Whether to include enriched service data
            **kwargs: Additional arguments for json.dumps
            
        Returns:
            JSON string representation
        """
        data = ReleaseSerializer.to_dict(release, include_enrichment)
        
        # Default JSON options
        json_options = {
            'indent': 2,
            'ensure_ascii': False,
            'sort_keys': True,
            'default': ReleaseSerializer._json_serializer
        }
        json_options.update(kwargs)
        
        return json.dumps(data, **json_options)
    
    @staticmethod
    def _json_serializer(obj: Any) -> str:
        """Custom JSON serializer for special types."""
        if hasattr(obj, 'isoformat'):
            return obj.isoformat()
        elif isinstance(obj, Path):
            return str(obj)
        else:
            return str(obj)


class DatabaseSerializer:
    """Serializer specifically for database storage with flattened structure."""
    
    @staticmethod
    def to_database_row(release: Release) -> Dict[str, Any]:
        """
        Convert Release to database row format.
        
        Args:
            release: Release object to serialize
            
        Returns:
            Dictionary suitable for database insertion
        """
        return {
            'id': release.id,
            'discogs_id': release.discogs_id,
            'title': release.title,
            'artists': json.dumps([DatabaseSerializer._db_serialize_artist(a) for a in release.artists], default=ReleaseSerializer._json_serializer),
            'year': release.year,
            'released': release.released,
            'country': release.country,
            'formats': json.dumps(release.formats, default=ReleaseSerializer._json_serializer),
            'labels': json.dumps(release.labels, default=ReleaseSerializer._json_serializer),
            'genres': json.dumps(release.genres, default=ReleaseSerializer._json_serializer),
            'styles': json.dumps(release.styles, default=ReleaseSerializer._json_serializer),
            'images': json.dumps([DatabaseSerializer._db_serialize_image(img) for img in release.images], default=ReleaseSerializer._json_serializer),
            'tracklist': json.dumps([DatabaseSerializer._db_serialize_track(t) for t in release.tracklist], default=ReleaseSerializer._json_serializer),
            'release_name_discogs': release.release_name_discogs,
            'release_name_apple_music': release.release_name_apple_music,
            'release_name_spotify': release.release_name_spotify,
            'apple_music_id': release.apple_music_id,
            'spotify_id': release.spotify_id,
            'lastfm_mbid': release.lastfm_mbid,
            'discogs_url': release.discogs_url,
            'apple_music_url': release.apple_music_url,
            'spotify_url': release.spotify_url,
            'lastfm_url': release.lastfm_url,
            'enrichment_data': DatabaseSerializer._serialize_enrichment_for_db(release),
            'created_at': release.created_at.isoformat() if release.created_at else None,
            'updated_at': release.updated_at.isoformat() if release.updated_at else None,
            'date_added': release.date_added.isoformat() if release.date_added else None,
            'local_images': json.dumps({k: str(v) if v else None for k, v in release.local_images.items()}, default=ReleaseSerializer._json_serializer) if release.local_images else '{}',
            'raw_data': json.dumps(release.raw_data, default=ReleaseSerializer._json_serializer) if release.raw_data else '{}'
        }
    
    @staticmethod
    def _db_serialize_artist(artist: Artist) -> Dict[str, Any]:
        """Serialize artist for database storage."""
        return {
            'name': artist.name,
            'role': artist.role,
            'discogs_id': artist.discogs_id
        }
    
    @staticmethod
    def _db_serialize_image(image: Image) -> Dict[str, Any]:
        """Serialize image for database storage."""
        return {
            'url': image.url,
            'type': image.type,
            'width': image.width,
            'height': image.height
        }
    
    @staticmethod
    def _db_serialize_track(track: Track) -> Dict[str, Any]:
        """Serialize track for database storage."""
        return {
            'position': track.position,
            'title': track.title,
            'duration': track.duration
        }
    
    @staticmethod
    def _serialize_enrichment_for_db(release: Release) -> str:
        """Serialize enrichment data for database storage."""
        # Use the centralized enrichment serialization from ReleaseSerializer
        services = ReleaseSerializer._serialize_enrichment_data(release)
        return json.dumps(services, default=ReleaseSerializer._json_serializer)


class ArtistSerializer:
    """Centralized serializer for Artist objects to ensure consistency."""
    
    @staticmethod
    def to_dict(artist: Artist, include_enrichment: bool = True) -> Dict[str, Any]:
        """
        Convert Artist to a comprehensive dictionary.
        
        Args:
            artist: Artist object to serialize
            include_enrichment: Whether to include enriched service data
            
        Returns:
            Dictionary representation of the artist
        """
        data = {
            'id': artist.id,
            'name': artist.name,
            'biography': artist.biography,
            
            # External IDs
            'discogs_id': artist.discogs_id,
            'apple_music_id': artist.apple_music_id,
            'spotify_id': artist.spotify_id,
            'lastfm_mbid': artist.lastfm_mbid,
            
            # URLs
            'discogs_url': artist.discogs_url,
            'apple_music_url': artist.apple_music_url,
            'spotify_url': artist.spotify_url,
            'lastfm_url': artist.lastfm_url,
            'wikipedia_url': artist.wikipedia_url,
            
            # Artist details
            'genres': artist.genres,
            'popularity': artist.popularity,
            'followers': artist.followers,
            'country': artist.country,
            'formed_date': artist.formed_date,
            
            # Images
            'images': [
                {
                    'url': img.url,
                    'type': img.type,
                    'width': img.width,
                    'height': img.height,
                }
                for img in artist.images
            ],
            
            # Local images if available
            'local_images': {
                size: str(path) if path else None
                for size, path in artist.local_images.items()
            },
            
            # Metadata
            'created_at': artist.created_at.isoformat() if artist.created_at else None,
            'updated_at': artist.updated_at.isoformat() if artist.updated_at else None,
        }
        
        # Add enrichment data if requested
        if include_enrichment and artist.raw_data:
            data['services'] = ArtistSerializer._serialize_enrichment_data(artist)
        
        return data
    
    @staticmethod
    def _serialize_enrichment_data(artist: Artist) -> Dict[str, Any]:
        """Serialize enrichment data from all services."""
        services = {}
        
        if hasattr(artist, 'raw_data') and artist.raw_data:
            # Apple Music data
            if 'apple_music' in artist.raw_data:
                apple_data = artist.raw_data['apple_music']
                services['apple_music'] = ArtistSerializer._serialize_apple_music_data(apple_data)
            
            # Spotify data
            if 'spotify' in artist.raw_data:
                spotify_data = artist.raw_data['spotify']
                services['spotify'] = ArtistSerializer._serialize_spotify_data(spotify_data)
            
            # Last.fm data
            if 'lastfm' in artist.raw_data:
                lastfm_data = artist.raw_data['lastfm']
                services['lastfm'] = ArtistSerializer._serialize_lastfm_data(lastfm_data)
            
            # Discogs data (including original name)
            if 'discogs' in artist.raw_data:
                services['discogs'] = artist.raw_data['discogs']
        
        return services
    
    @staticmethod
    def _serialize_apple_music_data(apple_data: Any) -> Dict[str, Any]:
        """Serialize Apple Music artist data."""
        if hasattr(apple_data, '__dict__'):
            return {
                'id': getattr(apple_data, 'id', None),
                'url': getattr(apple_data, 'url', None),
                'name': getattr(apple_data, 'name', None),
                'artwork_url': getattr(apple_data, 'artwork_url', None),
                'genres': getattr(apple_data, 'genres', []),
                'origin': getattr(apple_data, 'origin', None),
                'editorial_notes': getattr(apple_data, 'editorial_notes', None),
            }
        return apple_data if isinstance(apple_data, dict) else {}
    
    @staticmethod
    def _serialize_spotify_data(spotify_data: Any) -> Dict[str, Any]:
        """Serialize Spotify artist data."""
        if hasattr(spotify_data, '__dict__'):
            return {
                'id': getattr(spotify_data, 'id', None),
                'url': getattr(spotify_data, 'url', None),
                'name': getattr(spotify_data, 'name', None),
                'popularity': getattr(spotify_data, 'popularity', None),
                'followers': getattr(spotify_data, 'followers', None),
                'genres': getattr(spotify_data, 'genres', []),
                'images': getattr(spotify_data, 'images', []),
            }
        return spotify_data if isinstance(spotify_data, dict) else {}
    
    @staticmethod
    def _serialize_lastfm_data(lastfm_data: Any) -> Dict[str, Any]:
        """Serialize Last.fm artist data."""
        if hasattr(lastfm_data, '__dict__'):
            return {
                'name': getattr(lastfm_data, 'name', None),
                'url': getattr(lastfm_data, 'url', None),
                'mbid': getattr(lastfm_data, 'mbid', None),
                'listeners': getattr(lastfm_data, 'listeners', None),
                'playcount': getattr(lastfm_data, 'playcount', None),
                'bio_summary': getattr(lastfm_data, 'bio_summary', None),
                'bio_content': getattr(lastfm_data, 'bio_content', None),
                'tags': getattr(lastfm_data, 'tags', []),
                'similar_artists': getattr(lastfm_data, 'similar_artists', []),
                'images': getattr(lastfm_data, 'images', []),
            }
        return lastfm_data if isinstance(lastfm_data, dict) else {}
    
    @staticmethod
    def to_json(artist: Artist, include_enrichment: bool = True, **kwargs) -> str:
        """
        Convert Artist to JSON string.
        
        Args:
            artist: Artist object to serialize
            include_enrichment: Whether to include enriched service data
            **kwargs: Additional arguments for json.dumps
            
        Returns:
            JSON string representation
        """
        data = ArtistSerializer.to_dict(artist, include_enrichment)
        
        # Default JSON options
        json_options = {
            'indent': 2,
            'ensure_ascii': False,
            'sort_keys': True,
            'default': ReleaseSerializer._json_serializer
        }
        json_options.update(kwargs)
        
        return json.dumps(data, **json_options)
    
    @staticmethod
    def to_database_row(artist: Artist) -> Dict[str, Any]:
        """
        Convert Artist to database row format.
        
        Args:
            artist: Artist object to serialize
            
        Returns:
            Dictionary suitable for database insertion
        """
        return {
            'id': artist.id or f"{artist.name.lower().replace(' ', '-')}-{int(datetime.now().timestamp())}",
            'name': artist.name,
            'biography': artist.biography,
            'discogs_id': artist.discogs_id,
            'apple_music_id': artist.apple_music_id,
            'spotify_id': artist.spotify_id,
            'lastfm_mbid': artist.lastfm_mbid,
            'discogs_url': artist.discogs_url,
            'apple_music_url': artist.apple_music_url,
            'spotify_url': artist.spotify_url,
            'lastfm_url': artist.lastfm_url,
            'wikipedia_url': artist.wikipedia_url,
            'genres': json.dumps(artist.genres, default=ReleaseSerializer._json_serializer),
            'popularity': artist.popularity,
            'followers': artist.followers,
            'country': artist.country,
            'formed_date': artist.formed_date,
            'images': json.dumps([ArtistSerializer._db_serialize_image(img) for img in artist.images], default=ReleaseSerializer._json_serializer),
            'local_images': json.dumps(artist.local_images, default=ReleaseSerializer._json_serializer) if artist.local_images else '{}',
            'enrichment_data': ArtistSerializer._serialize_enrichment_for_db(artist),
            'created_at': artist.created_at.isoformat() if artist.created_at else None,
            'updated_at': artist.updated_at.isoformat() if artist.updated_at else None,
            'raw_data': json.dumps(artist.raw_data, default=ReleaseSerializer._json_serializer) if artist.raw_data else '{}'
        }
    
    @staticmethod
    def _db_serialize_image(image: Image) -> Dict[str, Any]:
        """Serialize image for database storage."""
        return {
            'url': image.url,
            'type': image.type,
            'width': image.width,
            'height': image.height
        }
    
    @staticmethod
    def _serialize_enrichment_for_db(artist: Artist) -> str:
        """Serialize enrichment data for database storage."""
        services = ArtistSerializer._serialize_enrichment_data(artist)
        return json.dumps(services, default=ReleaseSerializer._json_serializer)