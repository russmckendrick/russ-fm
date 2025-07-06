#!/usr/bin/env python3
"""Debug script to compare standalone vs orchestrator context."""

import discogs_client
import json
from pathlib import Path

def test_standalone():
    """Test exactly like our working standalone script."""
    print("🔍 STANDALONE TEST:")
    
    # Load config
    config_path = Path("config.json")
    with open(config_path) as f:
        config = json.load(f)

    # Get Discogs token
    discogs_config = config.get("discogs", {})
    token = discogs_config.get("access_token")

    # Initialize client
    d = discogs_client.Client('TestApp/1.0', user_token=token)

    # Test artist lookup
    artist_id = 1206719
    try:
        artist = d.artist(artist_id)
        print(f"✅ Created artist object: {artist.name}")
        
        # Access profile (this should trigger the API call)
        profile = artist.profile
        print(f"✅ Profile accessed: {len(profile)} chars")
        
        # Access images
        images = artist.images
        print(f"✅ Images accessed: {len(images)} items")
        
        # Show first image
        if images:
            print(f"✅ First image: {images[0].get('uri', 'No URI')}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_orchestrator_style():
    """Test with the same exact calls as orchestrator."""
    print("\n🔍 ORCHESTRATOR STYLE TEST:")
    
    # Load config exactly like orchestrator
    config_path = Path("config.json")
    with open(config_path) as f:
        config = json.load(f)

    discogs_config = config.get("discogs", {})
    token = discogs_config.get("access_token")

    # Initialize client exactly like orchestrator
    d = discogs_client.Client('MusicCollectionManager/1.0', user_token=token)

    artist_id = 1206719
    try:
        discogs_artist = d.artist(artist_id)
        print(f"✅ Created artist object: {discogs_artist.name}")
        
        # Try to access the same attributes
        profile = discogs_artist.profile
        print(f"✅ Profile accessed: {len(profile)} chars")
        
        images = discogs_artist.images
        print(f"✅ Images accessed: {len(images)} items")
        
        if images:
            print(f"✅ First image: {images[0].get('uri', 'No URI')}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_with_different_ids():
    """Test with string vs int ID."""
    print("\n🔍 ID TYPE TEST:")
    
    config_path = Path("config.json")
    with open(config_path) as f:
        config = json.load(f)

    discogs_config = config.get("discogs", {})
    token = discogs_config.get("access_token")
    d = discogs_client.Client('TestApp/1.0', user_token=token)

    # Test with int ID
    try:
        artist_int = d.artist(1206719)
        profile_int = artist_int.profile
        print(f"✅ Int ID (1206719): {len(profile_int)} chars")
    except Exception as e:
        print(f"❌ Int ID failed: {e}")

    # Test with string ID
    try:
        artist_str = d.artist("1206719")
        profile_str = artist_str.profile
        print(f"✅ String ID ('1206719'): {len(profile_str)} chars")
    except Exception as e:
        print(f"❌ String ID failed: {e}")

if __name__ == "__main__":
    print("🔍 DEBUGGING WHY STANDALONE WORKS BUT ORCHESTRATOR FAILS")
    print("=" * 60)
    
    standalone_works = test_standalone()
    orchestrator_works = test_orchestrator_style()
    
    print(f"\n📊 RESULTS:")
    print(f"Standalone: {'✅ WORKS' if standalone_works else '❌ FAILS'}")
    print(f"Orchestrator style: {'✅ WORKS' if orchestrator_works else '❌ FAILS'}")
    
    test_with_different_ids() 