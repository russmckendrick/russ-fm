#!/usr/bin/env python
"""
Test script to demonstrate artist matching and link generation.
Shows current capabilities and potential improvements.
"""

import json
import sqlite3
import random
from typing import List, Dict, Optional
from dataclasses import dataclass
import re
from urllib.parse import quote

@dataclass
class ArtistInfo:
    name: str
    discogs_id: str
    release_titles: List[str]
    discogs_url: str = ""
    apple_music_url: str = ""
    spotify_url: str = ""
    lastfm_url: str = ""
    wikipedia_url: str = ""

def normalize_artist_name(name: str) -> str:
    """Normalize artist name for better matching."""
    # Remove common suffixes/prefixes
    normalized = re.sub(r'\s*\([^)]*\)\s*$', '', name)  # Remove (1), (2), etc.
    normalized = re.sub(r'^The\s+', '', normalized, flags=re.IGNORECASE)  # Remove "The"
    normalized = re.sub(r'[^\w\s]', '', normalized)  # Remove special chars
    normalized = re.sub(r'\s+', ' ', normalized).strip().lower()
    return normalized

def get_artists_from_releases(conn: sqlite3.Connection, limit: int = 10) -> List[ArtistInfo]:
    """Extract unique artists from releases table."""
    cursor = conn.cursor()
    
    # Get all releases with non-Various artists
    query = """
        SELECT DISTINCT artists, title, discogs_id 
        FROM releases 
        WHERE artists NOT LIKE '%Various%' 
        AND artists IS NOT NULL
        ORDER BY RANDOM()
        LIMIT 100
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    artist_map = {}
    
    for artists_json, title, release_discogs_id in rows:
        try:
            artists = json.loads(artists_json)
            for artist in artists:
                if artist['name'] != 'Various Artists':
                    discogs_id = artist.get('discogs_id', '')
                    if discogs_id and discogs_id not in artist_map:
                        artist_map[discogs_id] = ArtistInfo(
                            name=artist['name'],
                            discogs_id=discogs_id,
                            release_titles=[title]
                        )
                    elif discogs_id in artist_map:
                        artist_map[discogs_id].release_titles.append(title)
        except json.JSONDecodeError:
            continue
    
    # Return random sample
    artists = list(artist_map.values())
    return random.sample(artists, min(limit, len(artists)))

def generate_discogs_url(discogs_id: str) -> str:
    """Generate Discogs URL from artist ID."""
    if discogs_id:
        return f"https://www.discogs.com/artist/{discogs_id}"
    return ""

def generate_search_urls(artist_name: str, release_context: Optional[str] = None) -> Dict[str, str]:
    """Generate search URLs for various services."""
    # Clean artist name for searching
    search_name = quote(artist_name)
    
    # If we have release context, use it for better matching
    if release_context:
        search_with_context = quote(f"{artist_name} {release_context}")
        normalized_name = normalize_artist_name(artist_name)
        normalized_context = normalize_artist_name(release_context)
    else:
        search_with_context = search_name
        normalized_name = normalize_artist_name(artist_name)
    
    urls = {
        'apple_music_search': f"https://music.apple.com/search?term={search_name}",
        'spotify_search': f"https://open.spotify.com/search/{search_name}/artists",
        'lastfm_search': f"https://www.last.fm/search/artists?q={search_name}",
        'wikipedia_search': f"https://en.wikipedia.org/w/index.php?search={search_name}",
    }
    
    # Add context-enhanced searches
    if release_context:
        urls.update({
            'apple_music_enhanced': f"https://music.apple.com/search?term={search_with_context}",
            'spotify_enhanced': f"https://open.spotify.com/search/{search_with_context}",
            'matching_score': calculate_matching_score(normalized_name, normalized_context)
        })
    
    return urls

def calculate_matching_score(artist_name: str, release_title: str) -> str:
    """Calculate a simple matching score to demonstrate improved matching."""
    # Check if artist name appears in release title
    if artist_name in release_title:
        return "HIGH - Artist name found in release title"
    
    # Check for partial matches
    artist_words = set(artist_name.split())
    release_words = set(release_title.split())
    common_words = artist_words.intersection(release_words)
    
    if len(common_words) > 0:
        return f"MEDIUM - {len(common_words)} common words found"
    
    return "LOW - No direct matches"

def main():
    """Main test function."""
    print("=" * 80)
    print("Artist Matching and Link Generation Test")
    print("=" * 80)
    print()
    
    # Connect to database
    conn = sqlite3.connect('collection_cache.db')
    
    # Get sample artists
    artists = get_artists_from_releases(conn, limit=10)
    
    if not artists:
        print("No artists found in database!")
        return
    
    # Process each artist
    for i, artist in enumerate(artists, 1):
        print(f"\n{i}. Artist: {artist.name}")
        print(f"   Discogs ID: {artist.discogs_id}")
        print(f"   Sample Releases: {', '.join(artist.release_titles[:3])}")
        print()
        
        # Generate direct Discogs URL
        artist.discogs_url = generate_discogs_url(artist.discogs_id)
        print(f"   ✅ Discogs URL: {artist.discogs_url}")
        
        # Generate search URLs for other services
        # First without context
        print("\n   🔍 Basic Search URLs (artist name only):")
        basic_urls = generate_search_urls(artist.name)
        for service, url in basic_urls.items():
            if 'search' in service:
                print(f"      {service}: {url}")
        
        # Then with release context for better matching
        if artist.release_titles:
            print(f"\n   🎯 Enhanced Search URLs (using release: '{artist.release_titles[0]}'):")
            enhanced_urls = generate_search_urls(artist.name, artist.release_titles[0])
            
            # Show matching score
            if 'matching_score' in enhanced_urls:
                print(f"      Matching Score: {enhanced_urls['matching_score']}")
            
            # Show enhanced search URLs
            for service, url in enhanced_urls.items():
                if 'enhanced' in service:
                    print(f"      {service}: {url}")
        
        print("\n   " + "-" * 70)
    
    # Summary of improvements
    print("\n" + "=" * 80)
    print("PROPOSED IMPROVEMENTS:")
    print("=" * 80)
    print()
    print("1. BATCH PROCESSING:")
    print("   - Add --from and --to parameters to process artists in batches")
    print("   - Example: python main.py artist-batch --from 0 --to 50")
    print()
    print("2. BETTER MATCHING:")
    print("   - Use release title context when searching for artists")
    print("   - Normalize artist names (remove 'The', special chars, etc.)")
    print("   - Score matches based on context relevance")
    print("   - For collaborations, search each artist separately")
    print()
    print("3. SKIP VARIOUS ARTISTS:")
    print("   - Add filter to skip 'Various Artists' automatically")
    print("   - Already filtered in the test query above")
    print()
    print("4. UTILIZE EXISTING DATA:")
    print("   - We already have Discogs IDs for most artists from releases")
    print("   - Can build direct Discogs URLs without searching")
    print("   - Use release metadata for better API matching")
    
    conn.close()

if __name__ == "__main__":
    main()