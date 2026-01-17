#!/usr/bin/env python3
"""Entry point for running the Music Collection Manager web interface."""

import os
import sys
from pathlib import Path

# Add the scrapper directory to the path
sys.path.insert(0, str(Path(__file__).parent))

import uvicorn
from web.config import web_config


def main():
    """Run the web server."""
    print("=" * 60)
    print("Music Collection Manager - Web Interface")
    print("=" * 60)
    print(f"\nStarting server at http://{web_config.host}:{web_config.port}")
    print(f"Admin interface: http://{web_config.host}:{web_config.port}/admin")
    print(f"\nDefault credentials: {web_config.admin_username} / {web_config.admin_password}")
    print("\nSet WEB_ADMIN_USERNAME and WEB_ADMIN_PASSWORD environment")
    print("variables to change the default credentials.")
    print("=" * 60 + "\n")

    uvicorn.run(
        "web.main:app",
        host=web_config.host,
        port=web_config.port,
        reload=web_config.debug,
        log_level="info" if not web_config.debug else "debug",
    )


if __name__ == "__main__":
    main()
