#!/usr/bin/env python
"""
Test service search URLs for a specific artist - demonstrates how search would work.
"""

import json
from urllib.parse import quote
import webbrowser

def generate_service_urls(artist_name: str, discogs_id: str, album_context: str = None):
    """Generate direct search URLs for various music services."""
    
    # URL encode the artist name
    artist_encoded = quote(artist_name)
    
    # Create search URLs
    urls = {
        'discogs': {
            'direct': f"https://www.discogs.com/artist/{discogs_id}",
            'search': f"https://www.discogs.com/search/?q={artist_encoded}&type=artist"
        },
        'apple_music': {
            'search': f"https://music.apple.com/search?term={artist_encoded}",
            'artist_search': f"https://music.apple.com/search?term={artist_encoded}&types=artists"
        },
        'spotify': {
            'search': f"https://open.spotify.com/search/{artist_encoded}",
            'artist_search': f"https://open.spotify.com/search/{artist_encoded}/artists"
        },
        'lastfm': {
            'search': f"https://www.last.fm/search/artists?q={artist_encoded}",
            'direct_attempt': f"https://www.last.fm/music/{artist_encoded}"
        },
        'wikipedia': {
            'search': f"https://en.wikipedia.org/w/index.php?search={artist_encoded}+band",
            'direct_attempt': f"https://en.wikipedia.org/wiki/{artist_encoded}"
        }
    }
    
    # Add album context searches if provided
    if album_context:
        album_encoded = quote(album_context)
        combined_encoded = quote(f"{artist_name} {album_context}")
        
        urls['enhanced'] = {
            'apple_with_album': f"https://music.apple.com/search?term={combined_encoded}",
            'spotify_with_album': f"https://open.spotify.com/search/{combined_encoded}",
            'lastfm_album': f"https://www.last.fm/search/albums?q={combined_encoded}"
        }
    
    return urls

def main():
    # Stereolab example
    artist_name = "Stereolab"
    discogs_id = "388"
    album = "Margerine Eclipse"
    
    print("=" * 80)
    print(f"MUSIC SERVICE SEARCH URLS FOR: {artist_name}")
    print("=" * 80)
    print()
    
    urls = generate_service_urls(artist_name, discogs_id, album)
    
    print("DIRECT LINKS:")
    print(f"✅ Discogs (we have the ID): {urls['discogs']['direct']}")
    print()
    
    print("APPLE MUSIC SEARCH:")
    print(f"🔍 General search: {urls['apple_music']['search']}")
    print(f"🎤 Artist-specific: {urls['apple_music']['artist_search']}")
    if 'enhanced' in urls:
        print(f"💿 With album context: {urls['enhanced']['apple_with_album']}")
    print()
    
    print("SPOTIFY SEARCH:")
    print(f"🔍 General search: {urls['spotify']['search']}")
    print(f"🎤 Artist-specific: {urls['spotify']['artist_search']}")
    if 'enhanced' in urls:
        print(f"💿 With album context: {urls['enhanced']['spotify_with_album']}")
    print()
    
    print("LAST.FM:")
    print(f"🔍 Artist search: {urls['lastfm']['search']}")
    print(f"🎯 Direct URL attempt: {urls['lastfm']['direct_attempt']}")
    print()
    
    print("WIKIPEDIA:")
    print(f"🔍 Search with 'band': {urls['wikipedia']['search']}")
    print(f"🎯 Direct URL attempt: {urls['wikipedia']['direct_attempt']}")
    print()
    
    print("-" * 80)
    print("NOTES FOR API INTEGRATION:")
    print("-" * 80)
    print()
    print("For actual API calls (not just searches), we would:")
    print()
    print("1. APPLE MUSIC API:")
    print("   - Use MusicKit API with search endpoint")
    print("   - Query: /v1/catalog/{storefront}/search?term=Stereolab&types=artists")
    print("   - Need to match artist name from results")
    print()
    print("2. SPOTIFY API:")
    print("   - Use Web API search endpoint") 
    print("   - Query: /v1/search?q=Stereolab&type=artist")
    print("   - Returns artist objects with IDs, popularity, genres")
    print()
    print("3. MATCHING STRATEGY:")
    print("   - Normalize names (remove special chars, lowercase)")
    print("   - Check exact matches first")
    print("   - Use Levenshtein distance for fuzzy matching")
    print("   - Boost confidence if genres match Discogs data")
    print("   - Use album context to disambiguate common names")
    
    # Show what the actual search would look like
    print()
    print("-" * 80)
    print("EXAMPLE API RESPONSES (what we'd get):")
    print("-" * 80)
    print()
    
    # Simulated responses
    print("SPOTIFY API Response (example):")
    print(json.dumps({
        "artists": {
            "items": [{
                "id": "5LhTec3c7dcqBvpLRWbMcf",
                "name": "Stereolab",
                "popularity": 51,
                "genres": ["art pop", "experimental", "indie rock", "post-rock"],
                "external_urls": {
                    "spotify": "https://open.spotify.com/artist/5LhTec3c7dcqBvpLRWbMcf"
                }
            }]
        }
    }, indent=2))
    
    print()
    print("APPLE MUSIC API Response (example):")
    print(json.dumps({
        "results": {
            "artists": {
                "data": [{
                    "id": "3840795",
                    "type": "artists",
                    "attributes": {
                        "name": "Stereolab",
                        "genreNames": ["Alternative", "Rock", "Indie Rock"],
                        "url": "https://music.apple.com/us/artist/stereolab/3840795"
                    }
                }]
            }
        }
    }, indent=2))

if __name__ == "__main__":
    main()