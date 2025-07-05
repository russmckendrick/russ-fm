# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a modern, well-structured Music Collection Management System. **This is the new v2 rewrite** with proper Python architecture, following best practices. It integrates with multiple music APIs (Discogs, Apple Music, Spotify, Wikipedia, Last.fm) to enrich collection data. The system supports both single release lookup and full collection processing.

## Development Guidelines

- **Schema Changes**: Do NOT create JSON or database schema changes outside of our `ReleaseSerializer` and `DatabaseSerializer` classes. All structural modifications must go through these dedicated serializer classes to ensure consistency and maintainability.
- **Documentation Maintenance**: When new CLI commands are added or modified, ALWAYS update the README.md file to reflect all available commands with their options and examples. The README.md serves as the primary user documentation.

## Common Development Commands

### Initial Setup
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Unix/macOS

# Install dependencies
pip install -r requirements.txt
pip install -e .

# Create configuration file
python main.py init
# Edit the generated config.example.json with your API credentials
cp config.example.json config.json
```

### Running the Application

**Single Release Lookup**:
```bash
# Get data for a specific Discogs release ID
python main.py release 123456

# Save to database and output as JSON
python main.py release 123456 --save --output json
```

**Collection Processing**:
```bash
# Process entire collection
python main.py collection

# Process with limits and resume capability
python main.py collection --limit 10 --resume
```

**Testing and Maintenance**:
```bash
# Test all service connections
python main.py test

# Check database status
python main.py status

# Backup database
python main.py backup
```

### Development Workflow
```bash
# Run tests
pytest tests/

# Code formatting
black music_collection_manager/
flake8 music_collection_manager/

# Type checking
mypy music_collection_manager/
```

## High-Level Architecture

The system follows a modern service-oriented architecture:

1. **Service Layer** (`music_collection_manager/services/`):
   - Separate service classes for each API (Discogs, Apple Music, Spotify, Wikipedia, Last.fm)
   - Base service class with rate limiting, error handling, and retry logic
   - Proper authentication management for each service

2. **Data Models** (`music_collection_manager/models/`):
   - Structured data classes for Release, Artist, Track, Image
   - Enrichment models for each service's specific data
   - Type-safe data handling with proper serialization

3. **Orchestrator** (`music_collection_manager/utils/orchestrator.py`):
   - Coordinates API calls across multiple services
   - Handles data enrichment and merging
   - Manages service availability and graceful degradation

4. **Database Layer** (`music_collection_manager/utils/database.py`):
   - SQLite database with proper schema
   - Tables: `releases`, `artists`, `collection_items`, `processing_log`
   - Resume capability and progress tracking

5. **CLI Interface** (`music_collection_manager/cli/`):
   - Rich command-line interface with progress bars
   - Commands for single release, collection processing, testing
   - Flexible output formats (JSON, YAML, table)

6. **Configuration Management** (`music_collection_manager/config/`):
   - JSON/YAML config files and environment variables
   - Service validation and credential management
   - Comprehensive logging setup

## Key Architectural Patterns

- **Service-Oriented Design**: Each API has its own dedicated service class
- **Error Handling**: Robust retry logic with exponential backoff and graceful degradation
- **Rate Limiting**: Built-in rate limiting for all services to prevent API throttling
- **Database-Driven Progress**: SQLite tracks processing state for resume capability
- **Configuration Management**: Multi-source configuration (files, environment variables)
- **Type Safety**: Data classes and type hints throughout the codebase
- **CLI Framework**: Rich command-line interface with click and rich libraries

## Important Implementation Details

- **Authentication**: 
  - Discogs: Personal access token
  - Apple Music: JWT with ES256, auto-regenerates every 12 hours
  - Spotify: Client credentials flow
  - Wikipedia: No auth required

- **Rate Limiting**: 
  - Built-in delays between API calls
  - Discogs: 60 req/min (2s delay enforced)
  - Conservative approach to avoid hitting limits

- **Error Handling**:
  - Continues processing on API failures
  - Logs errors to timestamped files in `logs/`
  - Web interface allows manual correction

- **File Organization**:
  - Python scripts in root directory
  - Templates in `templates/`
  - Database and logs in root
  - Generated content in `website/`

## Known Limitations & Considerations

- No formal test suite - manual testing required
- Security is development-grade (file-based secrets)
- Single-user design - no concurrent access handling
- Processing is slow due to API rate limits
- Large monolithic files need refactoring into services

## External Dependencies

The system integrates with:
- Hugo static site generator (external - not included)
- Four music service APIs requiring credentials
- SQLite database (file-based)
- Local filesystem for image storage

## Configuration

Key configuration points:
- `.secrets.json`: API credentials (gitignored)
- `backups/apple_private_key.p8`: Apple Music private key
- Hardcoded settings throughout code (refactoring opportunity)
- No environment-specific configurations