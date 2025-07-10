#!/usr/bin/env python3
"""
Database Management Tool for Music Collection Manager

This tool provides functionality to:
- Search for releases and artists
- List releases and artists with their added dates
- Delete releases and artists (with automatic backup)
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from tabulate import tabulate

import logging
from music_collection_manager.utils.database import DatabaseManager
from music_collection_manager.config import setup_logging

# Set up logging
setup_logging(level="INFO")
logger = logging.getLogger(__name__)


class DatabaseManagementTool:
    def __init__(self, db_path: str = "collection_cache.db"):
        self.db = DatabaseManager(db_path)
        self.db_path = db_path
        
    def backup_before_delete(self) -> str:
        """Create a backup before any delete operation"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"backup_before_delete_{timestamp}.db"
        backup_path = self.db.backup_database(backup_name)
        logger.info(f"Created backup: {backup_path}")
        return backup_path
    
    def search_releases(self, query: str) -> List[Dict[str, Any]]:
        """Search for releases by title or ID"""
        import sqlite3
        releases = []
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Try exact ID or Discogs ID match first
            cursor.execute(
                "SELECT id, discogs_id, title, artists, year, date_added FROM releases WHERE id = ? OR discogs_id = ?",
                (query, query)
            )
            row = cursor.fetchone()
            
            if row:
                releases.append({
                    'id': row[0],
                    'discogs_id': row[1],
                    'title': row[2],
                    'artists': row[3],
                    'year': row[4],
                    'date_added': row[5]
                })
            else:
                # Search by title
                cursor.execute(
                    "SELECT id, discogs_id, title, artists, year, date_added FROM releases WHERE LOWER(title) LIKE LOWER(?)",
                    (f"%{query}%",)
                )
                
                for row in cursor.fetchall():
                    releases.append({
                        'id': row[0],
                        'discogs_id': row[1],
                        'title': row[2],
                        'artists': row[3],
                        'year': row[4],
                        'date_added': row[5]
                    })
        
        return releases
    
    def search_artists(self, query: str) -> List[Dict[str, Any]]:
        """Search for artists by name or ID"""
        artists = []
        
        # Try exact ID match first
        artist = self.db.get_artist_by_id(query)
        if artist:
            artists.append(artist)
        else:
            # Search by name
            found_artists = self.db.search_artists(query)
            if found_artists:
                artists.extend(found_artists)
            
            # If no results, try partial ID match
            if not artists:
                import sqlite3
                with sqlite3.connect(self.db_path) as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT * FROM artists WHERE id LIKE ? LIMIT 10",
                        (f"{query}%",)
                    )
                    
                    columns = [col[0] for col in cursor.description]
                    for row in cursor.fetchall():
                        data = dict(zip(columns, row))
                        # Convert to Artist-like object or keep as dict
                        artists.append(data)
        
        return artists
    
    def list_releases(self, limit: int = 20, sort_by: str = 'date_added') -> List[Dict[str, Any]]:
        """List releases with their added dates"""
        import sqlite3
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            query = "SELECT id, discogs_id, title, artists, year, date_added FROM releases"
            
            if sort_by == 'date_added':
                query += " ORDER BY date_added DESC"
            elif sort_by == 'title':
                query += " ORDER BY title"
            elif sort_by == 'year':
                query += " ORDER BY year DESC"
            
            if limit > 0:
                query += f" LIMIT {limit}"
            
            cursor.execute(query)
            
            releases = []
            for row in cursor.fetchall():
                releases.append({
                    'id': row[0],
                    'discogs_id': row[1],
                    'title': row[2],
                    'artists': row[3],  # This is JSON
                    'year': row[4],
                    'date_added': row[5]
                })
            
            return releases
    
    def list_artists(self, limit: int = 20, sort_by: str = 'created_at') -> List[Dict[str, Any]]:
        """List artists with their added dates"""
        import sqlite3
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            query = "SELECT id, name, discogs_id, created_at FROM artists"
            
            if sort_by == 'created_at':
                query += " ORDER BY created_at DESC"
            elif sort_by == 'name':
                query += " ORDER BY name"
            
            if limit > 0:
                query += f" LIMIT {limit}"
            
            cursor.execute(query)
            
            artists = []
            for row in cursor.fetchall():
                artists.append({
                    'id': row[0],
                    'name': row[1],
                    'discogs_id': row[2],
                    'created_at': row[3],
                    'albums_count': len(self.get_artist_releases(row[0]))
                })
            
            return artists
    
    def get_artist_releases(self, artist_id: str) -> List[Dict[str, Any]]:
        """Get all releases for an artist"""
        import sqlite3
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Get all releases and check if artist is in the artists JSON
            cursor.execute("SELECT id, title, artists FROM releases")
            
            artist_releases = []
            for row in cursor.fetchall():
                artists = json.loads(row[2] if row[2] else '[]')
                
                for artist in artists:
                    if artist.get('id') == artist_id or artist.get('name') == artist_id:
                        artist_releases.append({
                            'id': row[0],
                            'title': row[1]
                        })
                        break
            
            return artist_releases
    
    def delete_release(self, release_id: str) -> bool:
        """Delete a release and its associated data"""
        # Create backup first
        self.backup_before_delete()
        
        import sqlite3
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Find the release
            cursor.execute(
                "SELECT id, title FROM releases WHERE id = ? OR discogs_id = ?",
                (release_id, release_id)
            )
            release = cursor.fetchone()
            
            if not release:
                logger.error(f"Release not found: {release_id}")
                return False
            
            release_id_internal = release[0]
            release_info = f"{release[1]} (ID: {release_id_internal})"
            
            # Delete associated collection items
            cursor.execute("DELETE FROM collection_items WHERE release_id = ?", (release_id_internal,))
            
            # Delete processing logs
            cursor.execute("DELETE FROM processing_log WHERE release_id = ?", (release_id_internal,))
            
            # Delete the release
            cursor.execute("DELETE FROM releases WHERE id = ?", (release_id_internal,))
            
            conn.commit()
            
            logger.info(f"Deleted release: {release_info}")
            
            # Also delete the JSON and image files
            self._delete_release_files(release_id_internal)
            
            return True
    
    def delete_artist(self, artist_id: str) -> bool:
        """Delete an artist and optionally their releases"""
        # Create backup first
        self.backup_before_delete()
        
        import sqlite3
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Find the artist - try exact match first, then partial ID match
            cursor.execute(
                "SELECT id, name FROM artists WHERE id = ? OR LOWER(name) = LOWER(?) OR id LIKE ?",
                (artist_id, artist_id, f"{artist_id}%")
            )
            artist = cursor.fetchone()
            
            if not artist:
                logger.error(f"Artist not found: {artist_id}")
                return False
            
            artist_id_internal = artist[0]
            artist_info = f"{artist[1]} (ID: {artist_id_internal})"
            
            # Check if artist has releases
            artist_releases = self.get_artist_releases(artist_id_internal)
            if artist_releases:
                logger.warning(f"Artist {artist_info} has {len(artist_releases)} releases")
                # Note: We're not deleting releases automatically to be safe
            
            # Delete the artist
            cursor.execute("DELETE FROM artists WHERE id = ?", (artist_id_internal,))
            
            conn.commit()
            
            logger.info(f"Deleted artist: {artist_info}")
            
            # Also delete the artist JSON and image files
            self._delete_artist_files(artist_id_internal)
            
            return True
    
    def _delete_release_files(self, release_id: str):
        """Delete release JSON and image files"""
        base_path = Path(__file__).parent.parent / "public" / "album"
        release_path = base_path / release_id
        
        if release_path.exists():
            import shutil
            shutil.rmtree(release_path)
            logger.info(f"Deleted release files: {release_path}")
    
    def _delete_artist_files(self, artist_id: str):
        """Delete artist JSON and image files"""
        base_path = Path(__file__).parent.parent / "public" / "artist"
        artist_path = base_path / artist_id
        
        if artist_path.exists():
            import shutil
            shutil.rmtree(artist_path)
            logger.info(f"Deleted artist files: {artist_path}")
    
    def format_release_table(self, releases: List[Dict[str, Any]]) -> str:
        """Format releases as a table"""
        headers = ["ID", "Discogs ID", "Title", "Artists", "Year", "Date Added"]
        rows = []
        
        for release in releases:
            artists = release.get('artists', [])
            if isinstance(artists, str):
                artists = json.loads(artists)
            artist_names = ", ".join([a.get('name', '') for a in artists])
            
            rows.append([
                release.get('id', ''),  # Show full ID
                release.get('discogs_id', ''),
                release.get('title', '')[:40],  # Truncate long titles
                artist_names[:30],  # Truncate long artist lists
                release.get('year', ''),
                release.get('date_added', '')[:19] if release.get('date_added') else ''
            ])
        
        return tabulate(rows, headers=headers, tablefmt="grid")
    
    def format_artist_table(self, artists: List[Any]) -> str:
        """Format artists as a table"""
        headers = ["ID", "Name", "Discogs ID", "Albums", "Date Added"]
        rows = []
        
        for artist in artists:
            # Handle both dict and object formats
            if isinstance(artist, dict):
                artist_id = artist.get('id', '')
                name = artist.get('name', '')
                discogs_id = artist.get('discogs_id', '')
                albums_count = artist.get('albums_count', 0)
                created_at = artist.get('created_at', '')
            else:
                # Assume it's an Artist object
                artist_id = getattr(artist, 'id', '')
                name = getattr(artist, 'name', '')
                discogs_id = getattr(artist, 'discogs_id', '')
                albums_count = len(self.get_artist_releases(artist_id))
                created_at = getattr(artist, 'created_at', '')
                if created_at and hasattr(created_at, 'isoformat'):
                    created_at = created_at.isoformat()
            
            rows.append([
                str(artist_id) if artist_id else "",  # Show full ID
                str(name)[:40],  # Truncate long names
                str(discogs_id) if discogs_id else "",
                albums_count,
                str(created_at)[:19] if created_at else ''
            ])
        
        return tabulate(rows, headers=headers, tablefmt="grid")


def main():
    parser = argparse.ArgumentParser(description="Database Management Tool for Music Collection")
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Search command
    search_parser = subparsers.add_parser('search', help='Search for releases or artists')
    search_parser.add_argument('type', choices=['release', 'artist'], help='What to search for')
    search_parser.add_argument('query', help='Search query (ID or name/title)')
    
    # List command
    list_parser = subparsers.add_parser('list', help='List releases or artists')
    list_parser.add_argument('type', choices=['releases', 'artists'], help='What to list')
    list_parser.add_argument('--limit', type=int, default=20, help='Number of items to show')
    list_parser.add_argument('--sort', choices=['date_added', 'title', 'year', 'name', 'created_at'], 
                            default='date_added', help='Sort order')
    
    # Delete command
    delete_parser = subparsers.add_parser('delete', help='Delete a release or artist')
    delete_parser.add_argument('type', choices=['release', 'artist'], help='What to delete')
    delete_parser.add_argument('id', help='ID of the item to delete')
    delete_parser.add_argument('--force', action='store_true', help='Skip confirmation')
    
    # Stats command
    stats_parser = subparsers.add_parser('stats', help='Show database statistics')
    
    # Backup command
    backup_parser = subparsers.add_parser('backup', help='Create a database backup')
    backup_parser.add_argument('--name', help='Optional backup name')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Initialize the tool
    tool = DatabaseManagementTool()
    
    try:
        if args.command == 'search':
            if args.type == 'release':
                results = tool.search_releases(args.query)
                if results:
                    print(f"\nFound {len(results)} release(s):")
                    print(tool.format_release_table(results))
                else:
                    print(f"No releases found for query: {args.query}")
            else:  # artist
                results = tool.search_artists(args.query)
                if results:
                    print(f"\nFound {len(results)} artist(s):")
                    print(tool.format_artist_table(results))
                else:
                    print(f"No artists found for query: {args.query}")
        
        elif args.command == 'list':
            if args.type == 'releases':
                releases = tool.list_releases(args.limit, args.sort)
                print(f"\nShowing {len(releases)} releases (sorted by {args.sort}):")
                print(tool.format_release_table(releases))
            else:  # artists
                artists = tool.list_artists(args.limit, args.sort)
                print(f"\nShowing {len(artists)} artists (sorted by {args.sort}):")
                print(tool.format_artist_table(artists))
        
        elif args.command == 'delete':
            # Show what will be deleted
            if args.type == 'release':
                releases = tool.search_releases(args.id)
                if not releases:
                    print(f"Release not found: {args.id}")
                    return
                print("\nWill delete the following release:")
                print(tool.format_release_table(releases))
            else:  # artist
                artists = tool.search_artists(args.id)
                if not artists:
                    print(f"Artist not found: {args.id}")
                    return
                print("\nWill delete the following artist:")
                print(tool.format_artist_table(artists))
                
                # Show associated releases
                # Handle both dict and object formats
                artist = artists[0]
                if isinstance(artist, dict):
                    artist_id = artist.get('id')
                else:
                    artist_id = getattr(artist, 'id', None)
                
                artist_releases = tool.get_artist_releases(artist_id) if artist_id else []
                if artist_releases:
                    print(f"\nWarning: This artist has {len(artist_releases)} associated releases:")
                    print(tool.format_release_table(artist_releases[:5]))
                    if len(artist_releases) > 5:
                        print(f"... and {len(artist_releases) - 5} more")
            
            # Confirm deletion
            if not args.force:
                response = input("\nAre you sure you want to delete this? (yes/no): ")
                if response.lower() != 'yes':
                    print("Deletion cancelled")
                    return
            
            # Perform deletion
            if args.type == 'release':
                success = tool.delete_release(args.id)
            else:  # artist
                success = tool.delete_artist(args.id)
            
            if success:
                print("Deletion completed successfully")
            else:
                print("Deletion failed")
        
        elif args.command == 'stats':
            stats = tool.db.get_stats()
            print("\nDatabase Statistics:")
            print(f"Total releases: {stats.get('total_releases', 0)}")
            print(f"Total collection items: {stats.get('total_collection_items', 0)}")
            print(f"Processed items: {stats.get('processed_items', 0)}")
            print(f"Enriched items: {stats.get('enriched_items', 0)}")
            
            # Get total artists count using sqlite3
            import sqlite3
            with sqlite3.connect(tool.db_path) as conn:
                cursor = conn.execute("SELECT COUNT(*) FROM artists")
                artist_count = cursor.fetchone()[0]
                print(f"Total artists: {artist_count}")
        
        elif args.command == 'backup':
            if args.name:
                backup_path = tool.db.backup_database(args.name)
            else:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_path = tool.db.backup_database(f"manual_backup_{timestamp}.db")
            print(f"Backup created: {backup_path}")
    
    except Exception as e:
        logger.error(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()