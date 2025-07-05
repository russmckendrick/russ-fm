#!/usr/bin/env python3
"""
Music Collection Manager - Main Entry Point

A modern, well-structured tool for managing music collections with data enrichment
from multiple sources including Discogs, Apple Music, Spotify, Wikipedia, and Last.fm.

Usage:
    python main.py release <discogs_id>      # Get data for a single release
    python main.py collection               # Process entire collection
    python main.py test                     # Test service connections
    python main.py init                     # Create example config
"""

from music_collection_manager.cli.main import main

if __name__ == "__main__":
    main()