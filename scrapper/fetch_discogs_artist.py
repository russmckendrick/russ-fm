#!/usr/bin/env python3
"""Standalone script to fetch Discogs artist data and save as JSON."""

import discogs_client
import json
import sys
from pathlib import Path

def fetch_discogs_artist_data(artist_id):
    """Fetch complete Discogs artist data and return as JSON."""
    
    # Load config
    config_path = Path("config.json")
    if not config_path.exists():
        print("❌ Config file not found")
        return None

    with open(config_path) as f:
        config = json.load(f)

    # Get Discogs token
    discogs_config = config.get("discogs", {})
    token = discogs_config.get("access_token")

    if not token:
        print("❌ No Discogs access token found")
        return None

    print(f"✅ Using Discogs token: {token[:10]}...")

    # Initialize client
    d = discogs_client.Client('DiscogsFetcher/1.0', user_token=token)

    try:
        print(f"🔍 Fetching artist data for ID: {artist_id}")
        artist = d.artist(artist_id)
        
        print(f"✅ Artist: {artist.name}")
        
        # Access all attributes to trigger full data loading
        profile = artist.profile
        images = artist.images
        urls = artist.urls
        name_variations = artist.name_variations
        members = artist.members
        
        print(f"📝 Profile: {len(profile)} characters")
        print(f"🖼️ Images: {len(images)} items")
        print(f"🔗 URLs: {len(urls)} items")
        print(f"🏷️ Name variations: {len(name_variations)} items")
        print(f"👥 Members: {len(members)} items")
        
        # Get the complete data
        artist_data = artist.data
        
        # Create enrichment data structure
        enrichment_data = {
            "id": str(artist_data.get("id", "")),
            "name": artist_data.get("name", ""),
            "url": artist_data.get("uri", ""),
            "resource_url": artist_data.get("resource_url", ""),
            "profile": artist_data.get("profile", ""),
            "images": artist_data.get("images", []),
            "urls": artist_data.get("urls", []),
            "namevariations": artist_data.get("namevariations", []),
            "members": artist_data.get("members", []),
            "cover_image": artist_data.get("images", [{}])[0].get("resource_url", "") if artist_data.get("images") else "",
            "thumb": artist_data.get("images", [{}])[0].get("uri150", "") if artist_data.get("images") else "",
            "raw_data": artist_data,
            "fetched_externally": True,
            "fetch_timestamp": "2025-07-06T13:50:00Z"
        }
        
        return enrichment_data
        
    except Exception as e:
        print(f"❌ Error fetching artist data: {e}")
        return None

def save_artist_data(artist_id, data):
    """Save artist data to a JSON file."""
    if not data:
        return False
        
    # Create discogs_cache directory if it doesn't exist
    cache_dir = Path("discogs_cache")
    cache_dir.mkdir(exist_ok=True)
    
    # Save to file
    filename = cache_dir / f"artist_{artist_id}.json"
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Saved artist data to: {filename}")
        return True
        
    except Exception as e:
        print(f"❌ Error saving data: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python fetch_discogs_artist.py <artist_id>")
        print("Example: python fetch_discogs_artist.py 1206719")
        sys.exit(1)
    
    artist_id = sys.argv[1]
    
    print(f"🚀 Fetching Discogs data for artist ID: {artist_id}")
    print("=" * 50)
    
    # Fetch the data
    data = fetch_discogs_artist_data(artist_id)
    
    if data:
        # Save to cache file
        if save_artist_data(artist_id, data):
            print(f"\n🎉 SUCCESS! Artist data cached for ID: {artist_id}")
            print(f"📁 File: discogs_cache/artist_{artist_id}.json")
        else:
            print(f"\n❌ Failed to save artist data")
    else:
        print(f"\n❌ Failed to fetch artist data") 