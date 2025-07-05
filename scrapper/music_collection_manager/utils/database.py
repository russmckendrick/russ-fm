"""Database manager for SQLite operations."""

import sqlite3
import json
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime

from ..models import Release, CollectionItem
from .serializers import DatabaseSerializer


class DatabaseManager:
    """Manages SQLite database operations."""
    
    def __init__(self, db_path: str, logger: Optional[logging.Logger] = None):
        self.db_path = Path(db_path)
        self.logger = logger or logging.getLogger(__name__)
        
        # Ensure database directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize database
        self._init_database()
    
    def _init_database(self):
        """Initialize database schema."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            
            # Releases table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS releases (
                    id TEXT PRIMARY KEY,
                    discogs_id TEXT UNIQUE,
                    title TEXT NOT NULL,
                    artists TEXT,  -- JSON array
                    year INTEGER,
                    released TEXT,
                    country TEXT,
                    formats TEXT,  -- JSON array
                    labels TEXT,   -- JSON array
                    genres TEXT,   -- JSON array
                    styles TEXT,   -- JSON array
                    images TEXT,   -- JSON array
                    tracklist TEXT,  -- JSON array
                    
                    -- External IDs
                    apple_music_id TEXT,
                    spotify_id TEXT,
                    lastfm_mbid TEXT,
                    
                    -- URLs
                    discogs_url TEXT,
                    apple_music_url TEXT,
                    spotify_url TEXT,
                    lastfm_url TEXT,
                    
                    -- Enrichment data
                    enrichment_data TEXT,  -- JSON
                    
                    -- Metadata
                    created_at TEXT,
                    updated_at TEXT,
                    date_added TEXT,
                    
                    -- Raw data
                    raw_data TEXT  -- JSON
                )
            """)
            
            # Artists table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS artists (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    biography TEXT,
                    
                    -- External IDs
                    discogs_id TEXT,
                    apple_music_id TEXT,
                    spotify_id TEXT,
                    lastfm_mbid TEXT,
                    
                    -- URLs
                    discogs_url TEXT,
                    apple_music_url TEXT,
                    spotify_url TEXT,
                    lastfm_url TEXT,
                    wikipedia_url TEXT,
                    
                    -- Artist details
                    genres TEXT,  -- JSON array
                    popularity INTEGER,
                    followers INTEGER,
                    country TEXT,
                    formed_date TEXT,
                    
                    -- Images
                    images TEXT,  -- JSON array
                    local_images TEXT,  -- JSON object with image paths
                    
                    -- Enrichment data
                    enrichment_data TEXT,  -- JSON
                    
                    -- Metadata
                    created_at TEXT,
                    updated_at TEXT,
                    
                    -- Raw data
                    raw_data TEXT  -- JSON
                )
            """)
            
            # Collection items table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS collection_items (
                    id TEXT PRIMARY KEY,
                    release_id TEXT,
                    folder_id TEXT,
                    instance_id TEXT,
                    date_added TEXT,
                    notes TEXT,
                    rating INTEGER,
                    
                    -- Processing status
                    processed BOOLEAN DEFAULT FALSE,
                    enriched BOOLEAN DEFAULT FALSE,
                    
                    -- Metadata
                    created_at TEXT,
                    updated_at TEXT,
                    
                    FOREIGN KEY (release_id) REFERENCES releases (id)
                )
            """)
            
            # Processing log table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS processing_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    release_id TEXT,
                    service TEXT,
                    status TEXT,  -- 'success', 'error', 'skipped'
                    message TEXT,
                    created_at TEXT,
                    
                    FOREIGN KEY (release_id) REFERENCES releases (id)
                )
            """)
            
            # Create indexes
            conn.execute("CREATE INDEX IF NOT EXISTS idx_releases_discogs_id ON releases (discogs_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_releases_title ON releases (title)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_collection_processed ON collection_items (processed)")
            
            conn.commit()
            
            # Run migrations for existing databases
            self._run_migrations(conn)
            
            self.logger.info(f"Database initialized at {self.db_path}")
    
    def _run_migrations(self, conn: sqlite3.Connection):
        """Run database migrations for schema updates."""
        try:
            # Check which columns exist
            cursor = conn.execute("PRAGMA table_info(releases)")
            columns = [row[1] for row in cursor.fetchall()]
            
            if 'date_added' not in columns:
                self.logger.info("Adding date_added column to releases table")
                conn.execute("ALTER TABLE releases ADD COLUMN date_added TEXT")
                conn.commit()
            
            # Add service-specific release name columns for matching reports
            if 'release_name_discogs' not in columns:
                self.logger.info("Adding release name columns for service matching")
                conn.execute("ALTER TABLE releases ADD COLUMN release_name_discogs TEXT")
                conn.execute("ALTER TABLE releases ADD COLUMN release_name_apple_music TEXT")
                conn.execute("ALTER TABLE releases ADD COLUMN release_name_spotify TEXT")
                conn.commit()
            
            # Add local_images column for local image paths
            if 'local_images' not in columns:
                self.logger.info("Adding local_images column for local image paths")
                conn.execute("ALTER TABLE releases ADD COLUMN local_images TEXT")  # JSON object
                conn.commit()
                
        except Exception as e:
            self.logger.warning(f"Migration error (non-critical): {str(e)}")
    
    def save_release(self, release: Release) -> bool:
        """Save a release to the database."""
        try:
            # Use centralized serializer for consistent database storage
            row_data = DatabaseSerializer.to_database_row(release)
            
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO releases (
                        id, discogs_id, title, artists, year, released, country,
                        formats, labels, genres, styles, images, tracklist,
                        release_name_discogs, release_name_apple_music, release_name_spotify,
                        apple_music_id, spotify_id, lastfm_mbid,
                        discogs_url, apple_music_url, spotify_url, lastfm_url,
                        enrichment_data, created_at, updated_at, date_added, local_images, raw_data
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    row_data['id'],
                    row_data['discogs_id'],
                    row_data['title'],
                    row_data['artists'],
                    row_data['year'],
                    row_data['released'],
                    row_data['country'],
                    row_data['formats'],
                    row_data['labels'],
                    row_data['genres'],
                    row_data['styles'],
                    row_data['images'],
                    row_data['tracklist'],
                    row_data['release_name_discogs'],
                    row_data['release_name_apple_music'],
                    row_data['release_name_spotify'],
                    row_data['apple_music_id'],
                    row_data['spotify_id'],
                    row_data['lastfm_mbid'],
                    row_data['discogs_url'],
                    row_data['apple_music_url'],
                    row_data['spotify_url'],
                    row_data['lastfm_url'],
                    row_data['enrichment_data'],
                    row_data['created_at'],
                    row_data['updated_at'],
                    row_data['date_added'],
                    row_data['local_images'],
                    row_data['raw_data']
                ))
                conn.commit()
                return True
                
        except Exception as e:
            self.logger.error(f"Failed to save release {release.id}: {str(e)}")
            return False
    
    
    def get_release(self, release_id: str) -> Optional[Release]:
        """Get a release by ID."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute("SELECT * FROM releases WHERE id = ?", (release_id,))
                row = cursor.fetchone()
                
                if row:
                    return self._row_to_release(row)
                
        except Exception as e:
            self.logger.error(f"Failed to get release {release_id}: {str(e)}")
        
        return None
    
    def get_release_by_discogs_id(self, discogs_id: str) -> Optional[Release]:
        """Get a release by Discogs ID."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute("SELECT * FROM releases WHERE discogs_id = ?", (discogs_id,))
                row = cursor.fetchone()
                
                if row:
                    return self._row_to_release(row)
                
        except Exception as e:
            self.logger.error(f"Failed to get release by Discogs ID {discogs_id}: {str(e)}")
        
        return None
    
    def get_all_releases(self, limit: Optional[int] = None) -> List[Release]:
        """Get all releases from database."""
        releases = []
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                
                query = "SELECT * FROM releases ORDER BY title"
                if limit:
                    query += f" LIMIT {limit}"
                
                cursor = conn.execute(query)
                rows = cursor.fetchall()
                description = cursor.description
                
                for row in rows:
                    try:
                        release = self._row_to_release(row, description)
                        if release:
                            releases.append(release)
                    except Exception as e:
                        self.logger.warning(f"Failed to parse release {row['discogs_id'] if 'discogs_id' in row.keys() else 'unknown'}: {str(e)}")
                        continue
                
        except Exception as e:
            self.logger.error(f"Failed to get all releases: {str(e)}")
        
        return releases
    
    def _row_to_release(self, row: sqlite3.Row) -> Release:
        """Convert database row to Release object."""
        from ..models import Artist, Image, Track
        
        # Parse artists
        artists = []
        artists_data = json.loads(row["artists"] or "[]")
        for artist_data in artists_data:
            artists.append(Artist(
                name=artist_data.get("name", ""),
                role=artist_data.get("role", "artist")
            ))
        
        # Parse images
        images = []
        images_data = json.loads(row["images"] or "[]")
        for img_data in images_data:
            images.append(Image(
                url=img_data.get("url", ""),
                type=img_data.get("type", "secondary")
            ))
        
        # Parse tracklist
        tracklist = []
        tracks_data = json.loads(row["tracklist"] or "[]")
        for track_data in tracks_data:
            tracklist.append(Track(
                position=track_data.get("position", ""),
                title=track_data.get("title", "")
            ))
        
        # Parse date_added if available
        date_added = None
        if row["date_added"]:
            try:
                date_added = datetime.fromisoformat(row["date_added"])
            except ValueError:
                pass
        
        release = Release(
            id=row["id"],
            title=row["title"],
            artists=artists,
            year=row["year"],
            released=row["released"],
            country=row["country"],
            formats=json.loads(row["formats"] or "[]"),
            labels=json.loads(row["labels"] or "[]"),
            genres=json.loads(row["genres"] or "[]"),
            styles=json.loads(row["styles"] or "[]"),
            images=images,
            tracklist=tracklist,
            discogs_id=row["discogs_id"],
            apple_music_id=row["apple_music_id"],
            spotify_id=row["spotify_id"],
            lastfm_mbid=row["lastfm_mbid"],
            discogs_url=row["discogs_url"],
            apple_music_url=row["apple_music_url"],
            spotify_url=row["spotify_url"],
            lastfm_url=row["lastfm_url"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            date_added=date_added,
            raw_data=json.loads(row["raw_data"] or "{}")
        )
        
        return release
    
    def get_collection_item_by_discogs_id(self, discogs_id: str) -> Optional[CollectionItem]:
        """Get a collection item by release's Discogs ID."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute("""
                    SELECT ci.* FROM collection_items ci
                    JOIN releases r ON ci.release_id = r.id
                    WHERE r.discogs_id = ?
                """, (discogs_id,))
                row = cursor.fetchone()
                
                if row:
                    # Get the release
                    release = self.get_release_by_discogs_id(discogs_id)
                    if release:
                        # Parse date_added
                        date_added = None
                        if row["date_added"]:
                            try:
                                date_added = datetime.fromisoformat(row["date_added"])
                            except ValueError:
                                pass
                        
                        from ..models import CollectionItem
                        return CollectionItem(
                            id=row["id"],
                            release=release,
                            instance_id=row["instance_id"],
                            folder_id=row["folder_id"],
                            date_added=date_added,
                            notes=row["notes"],
                            rating=row["rating"],
                            processed=bool(row["processed"]),
                            enriched=bool(row["enriched"])
                        )
                
        except Exception as e:
            self.logger.error(f"Failed to get collection item by Discogs ID {discogs_id}: {str(e)}")
        
        return None
    
    def save_collection_item(self, item: CollectionItem) -> bool:
        """Save a collection item to the database."""
        try:
            # First save the release
            if not self.save_release(item.release):
                return False
            
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO collection_items (
                        id, release_id, folder_id, instance_id, date_added,
                        notes, rating, processed, enriched, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item.id,
                    item.release.id,
                    item.folder_id,
                    item.instance_id,
                    item.date_added.isoformat() if item.date_added else None,
                    item.notes,
                    item.rating,
                    item.processed,
                    item.enriched,
                    datetime.now().isoformat(),
                    datetime.now().isoformat()
                ))
                conn.commit()
                return True
                
        except Exception as e:
            self.logger.error(f"Failed to save collection item {item.id}: {str(e)}")
            return False
    
    def get_unprocessed_items(self, limit: Optional[int] = None) -> List[str]:
        """Get list of unprocessed collection item IDs."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                query = "SELECT id FROM collection_items WHERE processed = FALSE"
                if limit:
                    query += f" LIMIT {limit}"
                
                cursor = conn.execute(query)
                return [row[0] for row in cursor.fetchall()]
                
        except Exception as e:
            self.logger.error(f"Failed to get unprocessed items: {str(e)}")
            return []
    
    def mark_item_processed(self, item_id: str, enriched: bool = False) -> bool:
        """Mark a collection item as processed."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    UPDATE collection_items 
                    SET processed = TRUE, enriched = ?, updated_at = ?
                    WHERE id = ?
                """, (enriched, datetime.now().isoformat(), item_id))
                conn.commit()
                return True
                
        except Exception as e:
            self.logger.error(f"Failed to mark item {item_id} as processed: {str(e)}")
            return False
    
    def log_processing(self, release_id: str, service: str, status: str, message: str = "") -> None:
        """Log processing activity."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    INSERT INTO processing_log (release_id, service, status, message, created_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (release_id, service, status, message, datetime.now().isoformat()))
                conn.commit()
                
        except Exception as e:
            self.logger.error(f"Failed to log processing: {str(e)}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get database statistics."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                stats = {}
                
                # Count releases
                cursor = conn.execute("SELECT COUNT(*) FROM releases")
                stats["total_releases"] = cursor.fetchone()[0]
                
                # Count collection items
                cursor = conn.execute("SELECT COUNT(*) FROM collection_items")
                stats["total_collection_items"] = cursor.fetchone()[0]
                
                # Count processed items
                cursor = conn.execute("SELECT COUNT(*) FROM collection_items WHERE processed = TRUE")
                stats["processed_items"] = cursor.fetchone()[0]
                
                # Count enriched items
                cursor = conn.execute("SELECT COUNT(*) FROM collection_items WHERE enriched = TRUE")
                stats["enriched_items"] = cursor.fetchone()[0]
                
                return stats
                
        except Exception as e:
            self.logger.error(f"Failed to get stats: {str(e)}")
            return {}
    
    def get_release_by_discogs_id(self, discogs_id: str) -> Optional[Release]:
        """Get a release by Discogs ID from the database."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    SELECT * FROM releases WHERE discogs_id = ?
                """, (discogs_id,))
                
                row = cursor.fetchone()
                if not row:
                    return None
                
                # Convert row to Release object
                return self._row_to_release(row, cursor.description)
                
        except Exception as e:
            self.logger.error(f"Failed to get release by Discogs ID {discogs_id}: {str(e)}")
            return None
    
    def has_enriched_release(self, discogs_id: str) -> bool:
        """Check if we have enriched data for a release."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    SELECT enrichment_data, apple_music_id, spotify_id, lastfm_mbid 
                    FROM releases WHERE discogs_id = ?
                """, (discogs_id,))
                
                row = cursor.fetchone()
                if not row:
                    return False
                
                enrichment_data, apple_music_id, spotify_id, lastfm_mbid = row
                
                # Check if we have meaningful enrichment data
                if enrichment_data and enrichment_data != '{}':
                    return True
                
                # Check if we have external IDs
                if apple_music_id or spotify_id or lastfm_mbid:
                    return True
                
                return False
                
        except Exception as e:
            self.logger.error(f"Failed to check enrichment for {discogs_id}: {str(e)}")
            return False
    
    def _row_to_release(self, row, description):
        """Convert database row to Release object."""
        from ..models import Release, Artist, Track, Image
        
        # Create column name mapping
        columns = [col[0] for col in description]
        data = dict(zip(columns, row))
        
        # Parse JSON fields
        artists_data = json.loads(data.get('artists') or '[]')
        images_data = json.loads(data.get('images') or '[]')
        tracklist_data = json.loads(data.get('tracklist') or '[]')
        raw_data = json.loads(data.get('raw_data') or '{}')
        local_images_data = json.loads(data.get('local_images') or '{}')
        
        # Parse date_added if available
        date_added = None
        if data.get('date_added'):
            try:
                date_added = datetime.fromisoformat(data['date_added'])
            except:
                pass
        
        # Create Release object
        release = Release(
            id=data['id'],
            title=data['title'],
            year=data.get('year'),
            released=data.get('released'),
            country=data.get('country'),
            formats=json.loads(data.get('formats', '[]')),
            labels=json.loads(data.get('labels', '[]')),
            genres=json.loads(data.get('genres', '[]')),
            styles=json.loads(data.get('styles', '[]')),
            release_name_discogs=data.get('release_name_discogs'),
            release_name_apple_music=data.get('release_name_apple_music'),
            release_name_spotify=data.get('release_name_spotify'),
            discogs_id=data.get('discogs_id'),
            apple_music_id=data.get('apple_music_id'),
            spotify_id=data.get('spotify_id'),
            lastfm_mbid=data.get('lastfm_mbid'),
            discogs_url=data.get('discogs_url'),
            apple_music_url=data.get('apple_music_url'),
            spotify_url=data.get('spotify_url'),
            lastfm_url=data.get('lastfm_url'),
            date_added=date_added,
            raw_data=raw_data,
            local_images={k: Path(v) if v else None for k, v in local_images_data.items()}
        )
        
        # Add artists
        for artist_data in artists_data:
            artist = Artist(
                name=artist_data.get('name', ''),
                role=artist_data.get('role', '')
            )
            release.add_artist(artist)
        
        # Add images
        for image_data in images_data:
            image = Image(
                url=image_data.get('url', ''),
                type=image_data.get('type', '')
            )
            release.add_image(image)
        
        # Add tracks
        for track_data in tracklist_data:
            track = Track(
                position=track_data.get('position', ''),
                title=track_data.get('title', '')
            )
            release.tracklist.append(track)
        
        return release
    
    def backup_database(self, backup_path: str) -> bool:
        """Create a backup of the database."""
        try:
            import shutil
            shutil.copy2(self.db_path, backup_path)
            self.logger.info(f"Database backed up to {backup_path}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to backup database: {str(e)}")
            return False
    
    # Artist-specific methods
    def save_artist(self, artist) -> bool:
        """Save an artist to the database."""
        try:
            # Use centralized serializer for consistent database storage
            from .serializers import ArtistSerializer
            row_data = ArtistSerializer.to_database_row(artist)
            
            with sqlite3.connect(self.db_path) as conn:
                # Build the INSERT OR REPLACE query dynamically
                columns = ', '.join(row_data.keys())
                placeholders = ', '.join(['?' for _ in row_data])
                
                conn.execute(f"""
                    INSERT OR REPLACE INTO artists ({columns})
                    VALUES ({placeholders})
                """, list(row_data.values()))
                
                conn.commit()
                self.logger.info(f"Saved artist {artist.name} to database")
                return True
                
        except Exception as e:
            self.logger.error(f"Failed to save artist {artist.name}: {str(e)}")
            return False
    
    def get_artist_by_name(self, name: str):
        """Get an artist by name from the database."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    SELECT * FROM artists WHERE name = ?
                """, (name,))
                
                row = cursor.fetchone()
                if row:
                    return self._row_to_artist(row, cursor.description)
                return None
                
        except Exception as e:
            self.logger.error(f"Failed to get artist {name}: {str(e)}")
            return None
    
    def get_artist_by_id(self, artist_id: str):
        """Get an artist by ID from the database."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    SELECT * FROM artists WHERE id = ?
                """, (artist_id,))
                
                row = cursor.fetchone()
                if row:
                    return self._row_to_artist(row, cursor.description)
                return None
                
        except Exception as e:
            self.logger.error(f"Failed to get artist {artist_id}: {str(e)}")
            return None
    
    def search_artists(self, query: str, limit: int = 50):
        """Search for artists by name."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    SELECT * FROM artists 
                    WHERE name LIKE ? 
                    ORDER BY name 
                    LIMIT ?
                """, (f"%{query}%", limit))
                
                return [self._row_to_artist(row, cursor.description) 
                       for row in cursor.fetchall()]
                
        except Exception as e:
            self.logger.error(f"Failed to search artists: {str(e)}")
            return []
    
    def has_enriched_artist(self, artist_name: str) -> bool:
        """Check if an artist has been enriched with external data."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    SELECT COUNT(*) FROM artists 
                    WHERE name = ? AND enrichment_data IS NOT NULL AND enrichment_data != '{}'
                """, (artist_name,))
                
                count = cursor.fetchone()[0]
                return count > 0
                
        except Exception as e:
            self.logger.error(f"Failed to check enrichment for {artist_name}: {str(e)}")
            return False
    
    def _row_to_artist(self, row, description):
        """Convert database row to Artist object."""
        from ..models import Artist
        
        # Create column name mapping
        columns = [col[0] for col in description]
        data = dict(zip(columns, row))
        
        # Parse JSON fields
        genres = json.loads(data.get('genres', '[]'))
        images = json.loads(data.get('images', '[]'))
        local_images = json.loads(data.get('local_images', '{}'))
        raw_data = json.loads(data.get('raw_data', '{}'))
        
        # Create Artist object
        artist = Artist(
            id=data.get('id'),
            name=data['name'],
            biography=data.get('biography'),
            discogs_id=data.get('discogs_id'),
            apple_music_id=data.get('apple_music_id'),
            spotify_id=data.get('spotify_id'),
            lastfm_mbid=data.get('lastfm_mbid'),
            discogs_url=data.get('discogs_url'),
            apple_music_url=data.get('apple_music_url'),
            spotify_url=data.get('spotify_url'),
            lastfm_url=data.get('lastfm_url'),
            wikipedia_url=data.get('wikipedia_url'),
            genres=genres,
            popularity=data.get('popularity'),
            followers=data.get('followers'),
            country=data.get('country'),
            formed_date=data.get('formed_date'),
            raw_data=raw_data
        )
        
        # Add parsed dates
        if data.get('created_at'):
            try:
                artist.created_at = datetime.fromisoformat(data['created_at'])
            except ValueError:
                pass
        
        if data.get('updated_at'):
            try:
                artist.updated_at = datetime.fromisoformat(data['updated_at'])
            except ValueError:
                pass
        
        # Add local images if available
        if local_images:
            artist.local_images = {k: Path(v) if v else None for k, v in local_images.items()}
        
        return artist
    
    def is_item_enriched(self, item_id: str) -> bool:
        """Check if a collection item has been enriched."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT enriched FROM collection_items WHERE id = ?",
                    (item_id,)
                )
                result = cursor.fetchone()
                return bool(result and result[0])
        except Exception as e:
            self.logger.error(f"Failed to check if item is enriched: {str(e)}")
            return False
    
    def has_release_by_discogs_id(self, discogs_id: str) -> bool:
        """Check if a release exists in the database by Discogs ID."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT 1 FROM releases WHERE discogs_id = ? LIMIT 1",
                    (discogs_id,)
                )
                return cursor.fetchone() is not None
        except Exception as e:
            self.logger.error(f"Failed to check if release exists: {str(e)}")
            return False