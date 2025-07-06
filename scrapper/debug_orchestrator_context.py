#!/usr/bin/env python3
"""Debug script to test discogs-client in orchestrator context."""

import discogs_client
import json
from pathlib import Path
import logging

def test_discogs_in_orchestrator_context():
    """Test discogs-client with the same setup as the orchestrator."""
    
    # Set up logging like the orchestrator
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    # Load config exactly like the orchestrator
    config_path = Path("config.json")
    if not config_path.exists():
        print("❌ Config file not found")
        exit(1)

    with open(config_path) as f:
        config = json.load(f)

    # Get discogs config exactly like the orchestrator
    discogs_config = config.get("discogs", {})
    token = discogs_config.get("access_token")

    if not token:
        logger.warning("❌ No Discogs access token found")
        return

    print(f"✅ Found Discogs token: {token[:10]}...")

    # Test both user agent strings
    user_agents = [
        'TestApp/1.0',  # Works in standalone
        'MusicCollectionManager/1.0',  # Used in orchestrator
    ]
    
    for user_agent in user_agents:
        print(f"\n🔍 Testing with user agent: {user_agent}")
        
        try:
            # Initialize client exactly like orchestrator
            d = discogs_client.Client(user_agent, user_token=token)
            
            # Test artist lookup
            artist_id = 1206719
            logger.info(f"🔍 About to call d.artist() with ID: {artist_id}")
            
            discogs_artist = d.artist(artist_id)
            logger.info(f"✅ Successfully fetched artist: {discogs_artist.name}")
            
            # Try to access profile to trigger data loading
            profile = discogs_artist.profile
            logger.info(f"🔍 Profile length: {len(profile)}")
            
            print(f"✅ SUCCESS with user agent: {user_agent}")
            
        except Exception as e:
            print(f"❌ FAILED with user agent: {user_agent}")
            print(f"   Error: {e}")
            logger.error(f"Error with {user_agent}: {e}")

if __name__ == "__main__":
    test_discogs_in_orchestrator_context() 