#!/usr/bin/env python3
"""Test script for python3-discogs-client library - DEBUG DATA FETCHING."""

import discogs_client
import json
from pathlib import Path

def test_discogs_client():
    """Test the python3-discogs-client library for artist data - DEBUG DATA FETCHING."""
    
    # Load config
    config_path = Path("config.json")
    if not config_path.exists():
        print("❌ Config file not found")
        exit(1)

    with open(config_path) as f:
        config = json.load(f)

    # Get Discogs token
    discogs_config = config.get("discogs", {})
    token = discogs_config.get("access_token")

    if not token:
        print("❌ No Discogs access token found in config")
        exit(1)

    print(f"✅ Found Discogs token: {token[:10]}...")

    # Initialize client
    d = discogs_client.Client('TestApp/1.0', user_token=token)

    # Test artist lookup
    artist_id = 1206719  # Airhead
    print(f"\n🔍 Looking up artist ID: {artist_id}")

    try:
        artist = d.artist(artist_id)
        print(f"✅ Successfully retrieved artist: {artist.name}")
        
        print(f"\n🔍 TESTING DATA ACCESS METHODS:")
        print("=" * 80)
        
        # Method 1: Direct access to data attribute
        print(f"1️⃣ Direct .data access:")
        print(f"   Type: {type(artist.data)}")
        print(f"   Keys: {list(artist.data.keys()) if isinstance(artist.data, dict) else 'Not a dict'}")
        
        # Method 2: Check if we need to fetch first
        print(f"\n2️⃣ Checking if we need to fetch():")
        try:
            artist.fetch()
            print(f"   fetch() completed successfully")
            print(f"   Data after fetch - Type: {type(artist.data)}")
            print(f"   Data after fetch - Keys: {list(artist.data.keys()) if isinstance(artist.data, dict) else 'Not a dict'}")
        except Exception as e:
            print(f"   fetch() failed: {e}")
        
        # Method 3: Access specific attributes directly
        print(f"\n3️⃣ Direct attribute access:")
        attrs_to_check = ['profile', 'images', 'urls', 'name_variations', 'members']
        for attr in attrs_to_check:
            try:
                value = getattr(artist, attr, 'NOT_FOUND')
                print(f"   {attr}: {type(value)} = {len(value) if hasattr(value, '__len__') else 'N/A'} items")
                if attr == 'images' and value:
                    print(f"     First image: {value[0] if value else 'None'}")
            except Exception as e:
                print(f"   {attr}: ERROR - {e}")
        
        # Method 4: Check the raw data after accessing attributes
        print(f"\n4️⃣ Raw data after accessing attributes:")
        print(f"   Type: {type(artist.data)}")
        if isinstance(artist.data, dict):
            print(f"   Keys: {list(artist.data.keys())}")
            for key in ['profile', 'images', 'urls', 'namevariations', 'members']:
                if key in artist.data:
                    value = artist.data[key]
                    print(f"   {key}: {type(value)} = {len(value) if hasattr(value, '__len__') else 'N/A'} items")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_discogs_client() 